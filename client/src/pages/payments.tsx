import { useState, useEffect, Fragment } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  CreditCard,
  Plus,
  Search,
  Ship,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Calendar,
  FileText,
  User,
  Filter,
  ChevronDown,
  ChevronUp,
  Receipt,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getErrorMessage, queryClient } from "@/lib/queryClient";
import { shipmentStatusColors } from "@/lib/colorMaps";
import type { Shipment, ShipmentPayment, InsertShipmentPayment } from "@shared/schema";
import { deriveAmountEgp, validateRemainingAllowance } from "./paymentValidation";

const PAYMENT_METHODS = [
  { value: "نقدي", label: "نقدي" },
  { value: "فودافون كاش", label: "فودافون كاش" },
  { value: "إنستاباي", label: "إنستاباي" },
  { value: "تحويل بنكي", label: "تحويل بنكي" },
  { value: "أخرى", label: "أخرى" },
];

const COST_COMPONENTS = [
  { value: "تكلفة البضاعة", label: "تكلفة البضاعة" },
  { value: "الشحن", label: "الشحن" },
  { value: "العمولة", label: "العمولة" },
  { value: "الجمرك", label: "الجمرك" },
  { value: "التخريج", label: "التخريج" },
];

const ITEMS_PER_PAGE = 25;

interface PaymentsStats {
  totalCostEgp: string;
  totalPaidEgp: string;
  totalBalanceEgp: string;
  totalCostRmb: string;
  totalPaidRmb: string;
  totalBalanceRmb: string;
  totalPaidPurchaseRmb: string;
  totalBalancePurchaseRmb: string;
  totalPaidPurchaseEgp: string;
  totalBalancePurchaseEgp: string;
  totalPaidShippingRmb: string;
  totalBalanceShippingRmb: string;
  totalPaidShippingEgp: string;
  totalBalanceShippingEgp: string;
  totalPaidCommissionRmb: string;
  totalBalanceCommissionRmb: string;
  totalPaidCommissionEgp: string;
  totalBalanceCommissionEgp: string;
  totalPaidCustomsEgp: string;
  totalBalanceCustomsEgp: string;
  totalPaidTakhreegEgp: string;
  totalBalanceTakhreegEgp: string;
  lastPayment: ShipmentPayment | null;
}

interface InvoiceSummary {
  shipmentId: number;
  shipmentCode: string;
  shipmentName: string;
  knownTotalCost: string;
  totalPaidEgp: string;
  remainingAllowed: string;
  paidByCurrency: Record<string, { original: string; convertedToEgp: string }>;
  rmb: {
    goodsTotal: string;
    shippingTotal: string;
    commissionTotal: string;
    subtotal: string;
    paid: string;
    remaining: string;
  };
  egp: {
    customsTotal: string;
    takhreegTotal: string;
    subtotal: string;
    paid: string;
    remaining: string;
  };
  paymentAllowance?: {
    knownTotalEgp: string;
    alreadyPaidEgp: string;
    remainingAllowedEgp: string;
    source: "declared" | "recovered";
  };
  computedAt: string;
}

export default function Payments() {
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedShipmentId, setSelectedShipmentId] = useState<number | null>(null);
  const [paymentCurrency, setPaymentCurrency] = useState("EGP");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [costComponent, setCostComponent] = useState("");
  const [expandedShipments, setExpandedShipments] = useState<Set<number>>(new Set());
  const [showInvoiceSummary, setShowInvoiceSummary] = useState(false);
  const [clientValidationError, setClientValidationError] = useState<string | null>(null);
  const [currentPageShipments, setCurrentPageShipments] = useState(1);
  const [currentPagePayments, setCurrentPagePayments] = useState(1);
  const { toast } = useToast();

  const { data: stats, isLoading: loadingStats } = useQuery<PaymentsStats>({
    queryKey: ["/api/payments/stats"],
  });

  const { data: shipments, isLoading: loadingShipments } = useQuery<Shipment[]>({
    queryKey: ["/api/shipments"],
  });

  const activeShipments = shipments?.filter((s) => s.status !== "مؤرشفة");

  const { data: payments, isLoading: loadingPayments } = useQuery<
    (ShipmentPayment & { shipment?: Shipment })[]
  >({
    queryKey: ["/api/payments"],
  });

  const { data: invoiceSummary, isLoading: loadingInvoiceSummary, isError: invoiceSummaryError } = useQuery<InvoiceSummary>({
    queryKey: ["/api/shipments", selectedShipmentId, "invoice-summary"],
    enabled: !!selectedShipmentId,
  });

  useEffect(() => {
    setClientValidationError(null);
  }, [selectedShipmentId, paymentCurrency, invoiceSummary?.paymentAllowance?.remainingAllowedEgp]);

  const createMutation = useMutation({
    mutationFn: async (data: InsertShipmentPayment) => {
      return apiRequest("POST", "/api/payments", data);
    },
    onSuccess: (_response, variables) => {
      toast({ title: "تم تسجيل الدفعة بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/shipments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments/stats"] });
      if (variables?.shipmentId) {
        queryClient.invalidateQueries({
          queryKey: ["/api/shipments", variables.shipmentId, "invoice-summary"],
        });
      }
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: getErrorMessage(error), variant: "destructive" });
    },
  });

  const resetForm = () => {
    setSelectedShipmentId(null);
    setPaymentCurrency("EGP");
    setPaymentMethod("");
    setCostComponent("");
    setShowInvoiceSummary(false);
    setClientValidationError(null);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setClientValidationError(null);
    const formData = new FormData(e.currentTarget);

    if (!selectedShipmentId) {
      toast({ title: "يرجى اختيار الشحنة", variant: "destructive" });
      return;
    }

    if (!costComponent) {
      toast({ title: "يرجى اختيار بند التكلفة", variant: "destructive" });
      return;
    }

    if (!paymentMethod) {
      toast({ title: "يرجى اختيار طريقة الدفع", variant: "destructive" });
      return;
    }

    const amountOriginal = formData.get("amountOriginal") as string;
    const exchangeRate = formData.get("exchangeRateToEgp") as string;
    const amountEgpNumber = deriveAmountEgp({
      paymentCurrency,
      amountOriginal,
      exchangeRate,
    });

    let latestInvoiceSummary = invoiceSummary;
    if (!latestInvoiceSummary && selectedShipmentId) {
      try {
        latestInvoiceSummary = await queryClient.ensureQueryData<InvoiceSummary>({
          queryKey: ["/api/shipments", selectedShipmentId, "invoice-summary"],
          queryFn: async () => {
            const res = await fetch(`/api/shipments/${selectedShipmentId}/invoice-summary`, { credentials: "include" });
            if (!res.ok) throw new Error("Failed to fetch invoice summary");
            return res.json();
          },
        });
      } catch (error) {
        toast({
          title: "تعذر التحقق من الحد المسموح للدفع",
          variant: "destructive",
        });
        return;
      }
    }

    const remainingAllowedValue =
      latestInvoiceSummary?.paymentAllowance?.remainingAllowedEgp !== undefined
        ? parseFloat(latestInvoiceSummary.paymentAllowance.remainingAllowedEgp)
        : undefined;

    const validation = validateRemainingAllowance({
      remainingAllowedEgp: Number.isFinite(remainingAllowedValue) ? remainingAllowedValue : undefined,
      attemptedAmountEgp: amountEgpNumber,
      formatter: (value) => formatCurrency(value),
    });

    if (!validation.allowed) {
      const message = validation.message || "لا يمكن دفع هذا المبلغ في الوقت الحالي";
      setClientValidationError(message);
      toast({ title: message, variant: "destructive" });
      return;
    }

    const safeAmountEgp = Number.isFinite(amountEgpNumber) ? amountEgpNumber : 0;

    const data: InsertShipmentPayment = {
      shipmentId: selectedShipmentId,
      paymentDate: new Date(formData.get("paymentDate") as string),
      paymentCurrency,
      amountOriginal,
      exchangeRateToEgp: paymentCurrency === "RMB" ? exchangeRate : null,
      amountEgp:
        paymentCurrency === "EGP"
          ? amountOriginal
          : safeAmountEgp.toFixed(2),
      costComponent,
      paymentMethod,
      cashReceiverName: (formData.get("cashReceiverName") as string) || null,
      referenceNumber: (formData.get("referenceNumber") as string) || null,
      note: (formData.get("note") as string) || null,
    };

    createMutation.mutate(data);
  };

  const formatCurrency = (value: string | number | null) => {
    const num = typeof value === "string" ? parseFloat(value) : value;
    return new Intl.NumberFormat("ar-EG", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num || 0);
  };

  const formatDate = (date: string | Date | null) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("ar-EG");
  };

  const toggleShipmentExpand = (shipmentId: number) => {
    setExpandedShipments(prev => {
      const next = new Set(prev);
      if (next.has(shipmentId)) {
        next.delete(shipmentId);
      } else {
        next.add(shipmentId);
      }
      return next;
    });
  };

  const clearFilters = () => {
    setSearch("");
    setDateFrom("");
    setDateTo("");
    setStatusFilter("all");
    setCurrentPageShipments(1);
    setCurrentPagePayments(1);
  };

  const filteredShipments = activeShipments?.filter((s) => {
    if (search && !s.shipmentName.toLowerCase().includes(search.toLowerCase()) && 
        !s.shipmentCode.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    if (statusFilter && statusFilter !== "all" && s.status !== statusFilter) {
      return false;
    }
    if (dateFrom) {
      const purchaseDate = s.purchaseDate ? new Date(s.purchaseDate) : null;
      if (!purchaseDate || purchaseDate < new Date(dateFrom)) return false;
    }
    if (dateTo) {
      const purchaseDate = s.purchaseDate ? new Date(s.purchaseDate) : null;
      if (!purchaseDate || purchaseDate > new Date(dateTo)) return false;
    }
    return true;
  });

  // Pagination for shipments
  const totalPagesShipments = Math.ceil((filteredShipments?.length || 0) / ITEMS_PER_PAGE);
  const startIndexShipments = (currentPageShipments - 1) * ITEMS_PER_PAGE;
  const endIndexShipments = startIndexShipments + ITEMS_PER_PAGE;
  const paginatedShipments = filteredShipments?.slice(startIndexShipments, endIndexShipments);

  const filteredPayments = payments?.filter((p) => {
    const shipment = shipments?.find(s => s.id === p.shipmentId);
    if (search && shipment && 
        !shipment.shipmentName.toLowerCase().includes(search.toLowerCase()) && 
        !shipment.shipmentCode.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    if (statusFilter && statusFilter !== "all" && shipment && shipment.status !== statusFilter) {
      return false;
    }
    if (dateFrom) {
      const paymentDate = p.paymentDate ? new Date(p.paymentDate) : null;
      if (!paymentDate || paymentDate < new Date(dateFrom)) return false;
    }
    if (dateTo) {
      const paymentDate = p.paymentDate ? new Date(p.paymentDate) : null;
      if (!paymentDate || paymentDate > new Date(dateTo)) return false;
    }
    return true;
  });

  // Pagination for payments ledger
  const totalPagesPayments = Math.ceil((filteredPayments?.length || 0) / ITEMS_PER_PAGE);
  const startIndexPayments = (currentPagePayments - 1) * ITEMS_PER_PAGE;
  const endIndexPayments = startIndexPayments + ITEMS_PER_PAGE;
  const paginatedPayments = filteredPayments?.slice(startIndexPayments, endIndexPayments);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">سداد الشحنات</h1>
          <p className="text-muted-foreground mt-1">
            متابعة إجمالي ما تم دفعه وما هو متبقي على جميع الشحنات
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-payment">
              <Plus className="w-4 h-4 ml-2" />
              إضافة دفعة جديدة
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>تسجيل دفعة جديدة</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>اختر الشحنة *</Label>
                <div className="flex gap-2">
                  <Select
                    value={selectedShipmentId?.toString() || ""}
                    onValueChange={(v) => setSelectedShipmentId(parseInt(v))}
                  >
                    <SelectTrigger data-testid="select-shipment" className="flex-1">
                      <SelectValue placeholder="اختر الشحنة" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeShipments?.map((s) => (
                        <SelectItem key={s.id} value={s.id.toString()}>
                          {s.shipmentCode} - {s.shipmentName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={!selectedShipmentId}
                    onClick={() => setShowInvoiceSummary(true)}
                    data-testid="button-invoice-summary"
                    title="ملخص الفاتورة"
                  >
                    <Receipt className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="paymentDate">تاريخ الدفع *</Label>
                  <Input
                    id="paymentDate"
                    name="paymentDate"
                    type="date"
                    defaultValue={new Date().toISOString().split("T")[0]}
                    required
                    data-testid="input-payment-date"
                  />
                </div>
                <div className="space-y-2">
                  <Label>عملة الدفع *</Label>
                  <Select value={paymentCurrency} onValueChange={setPaymentCurrency}>
                    <SelectTrigger data-testid="select-currency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EGP">جنيه مصري (ج.م)</SelectItem>
                      <SelectItem value="RMB">رممبي صيني (¥)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>تحت حساب أي جزء؟ *</Label>
                <Select value={costComponent} onValueChange={setCostComponent}>
                  <SelectTrigger data-testid="select-cost-component">
                    <SelectValue placeholder="اختر البند" />
                  </SelectTrigger>
                  <SelectContent>
                    {COST_COMPONENTS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {costComponent && stats && (
                  <div className="mt-2 p-2 bg-muted/50 rounded text-sm">
                    {costComponent === "تكلفة البضاعة" && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">إجمالي المدفوع في هذا البند</span>
                        <span className="font-semibold">{formatCurrency(stats.totalPaidPurchaseRmb)} ¥</span>
                      </div>
                    )}
                    {costComponent === "تكلفة البضاعة" && (
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-muted-foreground">المتبقي</span>
                        <span className="font-semibold text-amber-600">{formatCurrency(stats.totalBalancePurchaseRmb)} ¥</span>
                      </div>
                    )}
                    {costComponent === "الشحن" && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">إجمالي المدفوع في هذا البند</span>
                        <span className="font-semibold">{formatCurrency(stats.totalPaidShippingRmb)} ¥</span>
                      </div>
                    )}
                    {costComponent === "الشحن" && (
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-muted-foreground">المتبقي</span>
                        <span className="font-semibold text-amber-600">{formatCurrency(stats.totalBalanceShippingRmb)} ¥</span>
                      </div>
                    )}
                    {costComponent === "العمولة" && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">إجمالي المدفوع في هذا البند</span>
                        <span className="font-semibold">{formatCurrency(stats.totalPaidCommissionRmb)} ¥</span>
                      </div>
                    )}
                    {costComponent === "العمولة" && (
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-muted-foreground">المتبقي</span>
                        <span className="font-semibold text-amber-600">{formatCurrency(stats.totalBalanceCommissionRmb)} ¥</span>
                      </div>
                    )}
                    {costComponent === "الجمرك" && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">إجمالي المدفوع في هذا البند</span>
                        <span className="font-semibold">{formatCurrency(stats.totalPaidCustomsEgp)} ج.م</span>
                      </div>
                    )}
                    {costComponent === "الجمرك" && (
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-muted-foreground">المتبقي</span>
                        <span className="font-semibold text-amber-600">{formatCurrency(stats.totalBalanceCustomsEgp)} ج.م</span>
                      </div>
                    )}
                    {costComponent === "التخريج" && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">إجمالي المدفوع في هذا البند</span>
                        <span className="font-semibold">{formatCurrency(stats.totalPaidTakhreegEgp)} ج.م</span>
                      </div>
                    )}
                    {costComponent === "التخريج" && (
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-muted-foreground">المتبقي</span>
                        <span className="font-semibold text-amber-600">{formatCurrency(stats.totalBalanceTakhreegEgp)} ج.م</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="amountOriginal">المبلغ *</Label>
                  <Input
                    id="amountOriginal"
                    name="amountOriginal"
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    data-testid="input-amount"
                  />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>المتبقي المسموح (ج.م)</span>
                    {loadingInvoiceSummary ? (
                      <Skeleton className="h-4 w-24" />
                    ) : invoiceSummary?.paymentAllowance ? (
                      <span
                        className="font-semibold text-foreground"
                        data-testid="remaining-allowed-value"
                        data-allowed-value={invoiceSummary.paymentAllowance.remainingAllowedEgp}
                      >
                        {formatCurrency(invoiceSummary.paymentAllowance.remainingAllowedEgp)} ج.م
                      </span>
                    ) : (
                      <span data-testid="remaining-allowed-value">-</span>
                    )}
                  </div>
                </div>
                {paymentCurrency === "RMB" && (
                  <div className="space-y-2">
                    <Label htmlFor="exchangeRateToEgp">سعر الصرف (RMB→EGP) *</Label>
                    <Input
                      id="exchangeRateToEgp"
                      name="exchangeRateToEgp"
                      type="number"
                      step="0.0001"
                      required
                      placeholder="7.00"
                      data-testid="input-exchange-rate"
                    />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>طريقة الدفع *</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger data-testid="select-payment-method">
                    <SelectValue placeholder="اختر طريقة الدفع" />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {paymentMethod === "نقدي" && (
                <div className="space-y-2">
                  <Label htmlFor="cashReceiverName">اسم مستلم الكاش *</Label>
                  <Input
                    id="cashReceiverName"
                    name="cashReceiverName"
                    required
                    data-testid="input-cash-receiver"
                  />
                </div>
              )}

              {paymentMethod && paymentMethod !== "نقدي" && (
                <div className="space-y-2">
                  <Label htmlFor="referenceNumber">الرقم المرجعي</Label>
                  <Input
                    id="referenceNumber"
                    name="referenceNumber"
                    data-testid="input-reference"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="note">ملاحظات</Label>
                <Textarea
                  id="note"
                  name="note"
                  rows={2}
                  data-testid="input-note"
                />
              </div>

              {clientValidationError && (
                <div className="text-sm text-destructive" data-testid="validation-error">
                  {clientValidationError}
                </div>
              )}

              <div className="flex gap-2 pt-4">
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={createMutation.isPending}
                  data-testid="button-save-payment"
                >
                  {createMutation.isPending ? "جاري الحفظ..." : "حفظ الدفعة"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsDialogOpen(false);
                    resetForm();
                  }}
                >
                  إلغاء
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      {loadingStats ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard
            title="إجمالي تكلفة الشحنات"
            value={`${formatCurrency(stats?.totalCostEgp || 0)} ج.م`}
            icon={Ship}
          />
          <StatCard
            title="إجمالي المدفوع"
            value={`${formatCurrency(stats?.totalPaidEgp || 0)} ج.م`}
            icon={CreditCard}
            trend="up"
          />
          <StatCard
            title="إجمالي المتبقي"
            value={`${formatCurrency(stats?.totalBalanceEgp || 0)} ج.م`}
            icon={TrendingDown}
            trend={parseFloat(stats?.totalBalanceEgp || "0") > 0 ? "down" : undefined}
          />
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="shipments" className="space-y-4">
        <TabsList>
          <TabsTrigger value="shipments" data-testid="tab-shipments">
            الشحنات والأرصدة
          </TabsTrigger>
          <TabsTrigger value="ledger" data-testid="tab-ledger">
            كشف حركة السداد
          </TabsTrigger>
        </TabsList>

        <TabsContent value="shipments" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">الفلاتر</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="بحث بالشحنة..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pr-10"
                    data-testid="input-search-payments"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger data-testid="select-status-filter">
                    <SelectValue placeholder="حالة الشحنة" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">جميع الحالات</SelectItem>
                    <SelectItem value="في انتظار الشحن">في انتظار الشحن</SelectItem>
                    <SelectItem value="جاهزة للاستلام">جاهزة للاستلام</SelectItem>
                    <SelectItem value="مستلمة بنجاح">مستلمة بنجاح</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  placeholder="من تاريخ"
                  data-testid="input-date-from"
                />
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  placeholder="إلى تاريخ"
                  data-testid="input-date-to"
                />
              </div>
              {(search || statusFilter !== "all" || dateFrom || dateTo) && (
                <div className="mt-4 flex items-center justify-end">
                  <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-filters">
                    مسح الفلاتر
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Shipments Payment Table */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Ship className="w-5 h-5" />
                أرصدة الشحنات
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingShipments ? (
                <TableSkeleton />
              ) : filteredShipments && filteredShipments.length > 0 ? (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-right">رقم الشحنة</TableHead>
                          <TableHead className="text-right">اسم الشحنة</TableHead>
                          <TableHead className="text-right">الحالة</TableHead>
                          <TableHead className="text-right">التكلفة (ج.م)</TableHead>
                          <TableHead className="text-right">المدفوع (ج.م)</TableHead>
                          <TableHead className="text-right">الرصيد</TableHead>
                          <TableHead className="text-right">آخر سداد</TableHead>
                          <TableHead className="text-right">إجراءات</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedShipments?.map((shipment) => {
                          const isExpanded = expandedShipments.has(shipment.id);
                          const shipmentPayments = payments?.filter((p) => p.shipmentId === shipment.id) || [];
                          return (
                            <Fragment key={shipment.id}>
                              <TableRow
                                data-testid={`row-payment-${shipment.id}`}
                                className="cursor-pointer"
                                onClick={() => toggleShipmentExpand(shipment.id)}
                              >
                                <TableCell className="font-medium">
                                  <div className="flex items-center gap-2">
                                    {isExpanded ? (
                                      <ChevronUp className="w-4 h-4 text-muted-foreground" />
                                    ) : (
                                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                    )}
                                    {shipment.shipmentCode}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  {shipment.shipmentName}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className={shipmentStatusColors[shipment.status] || ""}>{shipment.status}</Badge>
                                </TableCell>
                                <TableCell>
                                  {formatCurrency(shipment.finalTotalCostEgp)}
                                </TableCell>
                                <TableCell>
                                  {formatCurrency(shipment.totalPaidEgp)}
                                </TableCell>
                                <TableCell>
                                  <BalanceBadge
                                    cost={shipment.finalTotalCostEgp}
                                    paid={shipment.totalPaidEgp}
                                  />
                                </TableCell>
                                <TableCell>
                                  {formatDate(shipment.lastPaymentDate)}
                                </TableCell>
                                <TableCell>
                                  <div className="flex gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedShipmentId(shipment.id);
                                        setShowInvoiceSummary(true);
                                      }}
                                      data-testid={`button-invoice-summary-${shipment.id}`}
                                    >
                                      <Receipt className="w-4 h-4 ml-1" />
                                      ملخص
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedShipmentId(shipment.id);
                                        setIsDialogOpen(true);
                                      }}
                                      data-testid={`button-add-payment-${shipment.id}`}
                                    >
                                      <Plus className="w-4 h-4 ml-1" />
                                      دفعة
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                              {isExpanded && (
                                <TableRow key={`${shipment.id}-details`}>
                                  <TableCell colSpan={8} className="bg-muted/30 p-4">
                                    {shipmentPayments.length > 0 ? (
                                      <div className="grid gap-2">
                                        {shipmentPayments.map((payment) => (
                                          <div
                                            key={payment.id}
                                            className="p-3 border rounded-md bg-background flex flex-wrap gap-3 justify-between"
                                          >
                                            <div className="space-y-1">
                                              <div className="text-sm text-muted-foreground">
                                                {new Date(payment.paymentDate).toLocaleString("ar-EG")}
                                              </div>
                                              <div className="font-semibold">
                                                {payment.paymentCurrency === "RMB" ? "¥" : "ج.م"}
                                                {" "}
                                                {formatCurrency(payment.amountOriginal)}
                                                <span className="text-sm text-muted-foreground mr-2">
                                                  ({payment.amountEgp} ج.م)
                                                </span>
                                              </div>
                                              <div className="text-sm">طريقة الدفع: {payment.paymentMethod}</div>
                                            </div>
                                            <div className="text-sm space-y-1 text-right">
                                              <div>تحت حساب: {payment.costComponent}</div>
                                              {payment.cashReceiverName && (
                                                <div>المستلم: {payment.cashReceiverName}</div>
                                              )}
                                              {payment.referenceNumber && (
                                                <div>المرجع: {payment.referenceNumber}</div>
                                              )}
                                              {payment.note && <div>ملاحظة: {payment.note}</div>}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <div className="text-sm text-muted-foreground text-center py-2">
                                        لا توجد مدفوعات بعد لهذه الشحنة
                                      </div>
                                    )}
                                  </TableCell>
                                </TableRow>
                              )}
                            </Fragment>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Pagination Controls */}
                  {totalPagesShipments > 1 && (
                    <div className="flex items-center justify-center gap-2 pt-4 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPageShipments(Math.max(1, currentPageShipments - 1))}
                        disabled={currentPageShipments === 1}
                        data-testid="button-prev-page-shipments"
                      >
                        <ChevronUp className="w-4 h-4" />
                        السابق
                      </Button>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: Math.min(totalPagesShipments, 5) }, (_, i) => {
                          let pageNum: number;
                          if (totalPagesShipments <= 5) {
                            pageNum = i + 1;
                          } else if (currentPageShipments <= 3) {
                            pageNum = i + 1;
                          } else if (currentPageShipments >= totalPagesShipments - 2) {
                            pageNum = totalPagesShipments - 4 + i;
                          } else {
                            pageNum = currentPageShipments - 2 + i;
                          }
                          return (
                            <Button
                              key={pageNum}
                              variant={currentPageShipments === pageNum ? "default" : "outline"}
                              size="sm"
                              onClick={() => setCurrentPageShipments(pageNum)}
                              data-testid={`button-page-shipments-${pageNum}`}
                            >
                              {pageNum}
                            </Button>
                          );
                        })}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPageShipments(Math.min(totalPagesShipments, currentPageShipments + 1))}
                        disabled={currentPageShipments === totalPagesShipments}
                        data-testid="button-next-page-shipments"
                      >
                        التالي
                        <ChevronDown className="w-4 h-4" />
                      </Button>
                      <span className="text-sm text-muted-foreground mr-4">
                        صفحة {currentPageShipments} من {totalPagesShipments}
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <EmptyState
                  icon={Ship}
                  title="لا توجد شحنات"
                  description="أضف شحنات لبدء تتبع المدفوعات"
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ledger" className="space-y-4">
          {/* Filters for Ledger */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">الفلاتر</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="بحث بالشحنة..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pr-10"
                    data-testid="input-search-ledger"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger data-testid="select-ledger-status-filter">
                    <SelectValue placeholder="حالة الشحنة" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">جميع الحالات</SelectItem>
                    <SelectItem value="في انتظار الشحن">في انتظار الشحن</SelectItem>
                    <SelectItem value="جاهزة للاستلام">جاهزة للاستلام</SelectItem>
                    <SelectItem value="مستلمة بنجاح">مستلمة بنجاح</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  placeholder="من تاريخ"
                  data-testid="input-ledger-date-from"
                />
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  placeholder="إلى تاريخ"
                  data-testid="input-ledger-date-to"
                />
              </div>
              {(search || statusFilter !== "all" || dateFrom || dateTo) && (
                <div className="mt-4 flex items-center justify-end">
                  <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-ledger-filters">
                    مسح الفلاتر
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="w-5 h-5" />
                كشف حركة السداد
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingPayments ? (
                <TableSkeleton />
              ) : filteredPayments && filteredPayments.length > 0 ? (
                <div className="space-y-4">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-right">التاريخ</TableHead>
                          <TableHead className="text-right">الشحنة</TableHead>
                          <TableHead className="text-right">تحت حساب</TableHead>
                          <TableHead className="text-right">المبلغ الأصلي</TableHead>
                          <TableHead className="text-right">المبلغ (ج.م)</TableHead>
                          <TableHead className="text-right">طريقة الدفع</TableHead>
                          <TableHead className="text-right">المستلم/المرجع</TableHead>
                          <TableHead className="text-right">ملاحظات</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedPayments?.map((payment) => (
                        <TableRow
                          key={payment.id}
                          data-testid={`row-ledger-${payment.id}`}
                        >
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4 text-muted-foreground" />
                              {formatDate(payment.paymentDate)}
                            </div>
                          </TableCell>
                          <TableCell>
                            {payment.shipment?.shipmentCode || "-"}
                          </TableCell>
                          <TableCell>{payment.costComponent}</TableCell>
                          <TableCell>
                            <span className="font-mono">
                              {payment.paymentCurrency === "RMB" ? "¥" : "ج.م"}{" "}
                              {formatCurrency(payment.amountOriginal)}
                            </span>
                          </TableCell>
                          <TableCell className="font-bold">
                            {formatCurrency(payment.amountEgp)} ج.م
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{payment.paymentMethod}</Badge>
                          </TableCell>
                          <TableCell>
                            {payment.paymentMethod === "نقدي" ? (
                              <div className="flex items-center gap-1">
                                <User className="w-3 h-3" />
                                {payment.cashReceiverName}
                              </div>
                            ) : (
                              payment.referenceNumber || "-"
                            )}
                          </TableCell>
                          <TableCell className="max-w-xs">
                            <div className="line-clamp-2 break-words">
                              {payment.note || "-"}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Pagination Controls */}
                  {totalPagesPayments > 1 && (
                    <div className="flex items-center justify-center gap-2 pt-4 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPagePayments(Math.max(1, currentPagePayments - 1))}
                        disabled={currentPagePayments === 1}
                        data-testid="button-prev-page-payments-ledger"
                      >
                        <ChevronUp className="w-4 h-4" />
                        السابق
                      </Button>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: Math.min(totalPagesPayments, 5) }, (_, i) => {
                          let pageNum: number;
                          if (totalPagesPayments <= 5) {
                            pageNum = i + 1;
                          } else if (currentPagePayments <= 3) {
                            pageNum = i + 1;
                          } else if (currentPagePayments >= totalPagesPayments - 2) {
                            pageNum = totalPagesPayments - 4 + i;
                          } else {
                            pageNum = currentPagePayments - 2 + i;
                          }
                          return (
                            <Button
                              key={pageNum}
                              variant={currentPagePayments === pageNum ? "default" : "outline"}
                              size="sm"
                              onClick={() => setCurrentPagePayments(pageNum)}
                              data-testid={`button-page-payments-ledger-${pageNum}`}
                            >
                              {pageNum}
                            </Button>
                          );
                        })}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPagePayments(Math.min(totalPagesPayments, currentPagePayments + 1))}
                        disabled={currentPagePayments === totalPagesPayments}
                        data-testid="button-next-page-payments-ledger"
                      >
                        التالي
                        <ChevronDown className="w-4 h-4" />
                      </Button>
                      <span className="text-sm text-muted-foreground mr-4">
                        صفحة {currentPagePayments} من {totalPagesPayments}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <EmptyState
                  icon={CreditCard}
                  title="لا توجد مدفوعات"
                  description="سجل أول دفعة لبدء التتبع"
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Invoice Summary Modal - at root level for proper focus management */}
      <Dialog open={showInvoiceSummary} onOpenChange={setShowInvoiceSummary}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="w-5 h-5" />
              ملخص فاتورة الشحنة
            </DialogTitle>
          </DialogHeader>
          {loadingInvoiceSummary ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : invoiceSummaryError ? (
            <div className="text-center py-4">
              <div className="text-destructive mb-2">حدث خطأ أثناء تحميل البيانات</div>
              <Button variant="outline" size="sm" onClick={() => setShowInvoiceSummary(false)}>
                إغلاق
              </Button>
            </div>
          ) : invoiceSummary ? (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                {invoiceSummary.shipmentCode} - {invoiceSummary.shipmentName}
              </div>

              <div className="border rounded-md p-3 space-y-2">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  <span className="text-lg">ج.م</span>
                  الملخص المالي
                </h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">التكلفة المعروفة:</span>
                  <span className="text-left font-mono">{formatCurrency(invoiceSummary.knownTotalCost)} ج.م</span>

                  <span className="text-muted-foreground">المدفوع (محول):</span>
                  <span className="text-left font-mono text-green-600 dark:text-green-400">{formatCurrency(invoiceSummary.totalPaidEgp)} ج.م</span>

                  <span className="text-muted-foreground">المتبقي المسموح:</span>
                  <span className="text-left font-mono text-red-600 dark:text-red-400">{formatCurrency(invoiceSummary.remainingAllowed)} ج.م</span>
                </div>

                {invoiceSummary.paidByCurrency && Object.keys(invoiceSummary.paidByCurrency).length > 0 && (
                  <div className="pt-2 border-t space-y-1">
                    <div className="text-xs text-muted-foreground">تفاصيل المدفوعات حسب العملة:</div>
                    {Object.entries(invoiceSummary.paidByCurrency).map(([currency, values]) => (
                      <div key={currency} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">مدفوع {currency}:</span>
                        <span className="text-left font-mono">
                          {formatCurrency(values.original)} {currency}
                          <span className="text-muted-foreground text-xs ml-2">
                            ({formatCurrency(values.convertedToEgp)} ج.م)
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              {/* RMB Section */}
              <div className="border rounded-md p-3 space-y-2">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  <span className="text-lg">¥</span>
                  تكاليف اليوان الصيني (RMB)
                </h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">تكلفة البضاعة:</span>
                  <span className="text-left font-mono">{formatCurrency(invoiceSummary.rmb.goodsTotal)} ¥</span>
                  
                  <span className="text-muted-foreground">تكلفة الشحن:</span>
                  <span className="text-left font-mono">{formatCurrency(invoiceSummary.rmb.shippingTotal)} ¥</span>
                  
                  <span className="text-muted-foreground">العمولة:</span>
                  <span className="text-left font-mono">{formatCurrency(invoiceSummary.rmb.commissionTotal)} ¥</span>
                  
                  <span className="font-medium border-t pt-1">الإجمالي:</span>
                  <span className="text-left font-mono font-medium border-t pt-1">{formatCurrency(invoiceSummary.rmb.subtotal)} ¥</span>
                  
                  <span className="text-green-600 dark:text-green-400">المدفوع:</span>
                  <span className="text-left font-mono text-green-600 dark:text-green-400">{formatCurrency(invoiceSummary.rmb.paid)} ¥</span>
                  
                  <span className="text-red-600 dark:text-red-400">المتبقي:</span>
                  <span className="text-left font-mono text-red-600 dark:text-red-400">{formatCurrency(invoiceSummary.rmb.remaining)} ¥</span>
                </div>
              </div>
              
              {/* EGP Section */}
              <div className="border rounded-md p-3 space-y-2">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  <span className="text-lg">ج.م</span>
                  تكاليف الجنيه المصري (EGP)
                </h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">الجمارك:</span>
                  <span className="text-left font-mono">{formatCurrency(invoiceSummary.egp.customsTotal)} ج.م</span>
                  
                  <span className="text-muted-foreground">التخريج:</span>
                  <span className="text-left font-mono">{formatCurrency(invoiceSummary.egp.takhreegTotal)} ج.م</span>
                  
                  <span className="font-medium border-t pt-1">الإجمالي:</span>
                  <span className="text-left font-mono font-medium border-t pt-1">{formatCurrency(invoiceSummary.egp.subtotal)} ج.م</span>
                  
                  <span className="text-green-600 dark:text-green-400">المدفوع:</span>
                  <span className="text-left font-mono text-green-600 dark:text-green-400">{formatCurrency(invoiceSummary.egp.paid)} ج.م</span>
                  
                  <span className="text-red-600 dark:text-red-400">المتبقي:</span>
                  <span className="text-left font-mono text-red-600 dark:text-red-400">{formatCurrency(invoiceSummary.egp.remaining)} ج.م</span>
                </div>
              </div>

              {invoiceSummary.paymentAllowance && (
                <div className="border rounded-md p-3 bg-muted/40 space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">إجمالي التكاليف المعروفة (ج.م)</span>
                    <span className="font-mono font-medium">
                      {formatCurrency(invoiceSummary.paymentAllowance.knownTotalEgp)} ج.م
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">المدفوع حتى الآن (ج.م)</span>
                    <span className="font-mono">
                      {formatCurrency(invoiceSummary.paymentAllowance.alreadyPaidEgp)} ج.م
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                    <span>المتبقي المسموح سداده الآن</span>
                    <span>
                      {formatCurrency(invoiceSummary.paymentAllowance.remainingAllowedEgp)} ج.م
                    </span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center text-muted-foreground py-4">
              لا توجد بيانات
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  trend,
}: {
  title: string;
  value: string;
  icon: typeof Ship;
  trend?: "up" | "down";
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
          <div
            className={`w-12 h-12 rounded-md flex items-center justify-center ${
              trend === "up"
                ? "bg-green-100 dark:bg-green-900/30"
                : trend === "down"
                ? "bg-red-100 dark:bg-red-900/30"
                : "bg-primary/10"
            }`}
          >
            <Icon
              className={`w-6 h-6 ${
                trend === "up"
                  ? "text-green-600 dark:text-green-400"
                  : trend === "down"
                  ? "text-red-600 dark:text-red-400"
                  : "text-primary"
              }`}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function BalanceBadge({
  cost,
  paid,
}: {
  cost: string | number | null;
  paid: string | number | null;
}) {
  const costValue = typeof cost === "string" ? parseFloat(cost) : cost || 0;
  const paidValue = typeof paid === "string" ? parseFloat(paid) : paid || 0;
  const remaining = Math.max(0, costValue - paidValue);

  const formatCurrency = (num: number) =>
    new Intl.NumberFormat("ar-EG", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);

  if (remaining === 0) {
    return (
      <Badge
        variant="outline"
        className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
      >
        مسددة
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
    >
      متبقي: {formatCurrency(remaining)} ج.م
    </Badge>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Ship;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-6">
        <Icon className="w-10 h-10 text-muted-foreground" />
      </div>
      <h3 className="text-xl font-medium mb-2">{title}</h3>
      <p className="text-muted-foreground">{description}</p>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3, 4, 5].map((i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}
