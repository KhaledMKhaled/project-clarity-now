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
import { queryClient } from "@/lib/queryClient";
import { shipmentStatusColors } from "@/lib/colorMaps";
import { supabase } from "@/integrations/supabase/client";
import type { Shipment, ShipmentPayment } from "@/types/database";

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
  const [currentPageShipments, setCurrentPageShipments] = useState(1);
  const [currentPagePayments, setCurrentPagePayments] = useState(1);
  const { toast } = useToast();

  const { data: shipments, isLoading: loadingShipments } = useQuery({
    queryKey: ["shipments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shipments")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Shipment[];
    },
  });

  const activeShipments = shipments?.filter((s) => s.status !== "مؤرشفة");

  const { data: payments, isLoading: loadingPayments } = useQuery({
    queryKey: ["payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shipment_payments")
        .select("*")
        .order("payment_date", { ascending: false });
      if (error) throw error;
      return data as ShipmentPayment[];
    },
  });

  // Calculate stats from shipments
  const stats = {
    totalCostEgp: shipments?.reduce((sum, s) => sum + (s.final_total_cost_egp || 0), 0) || 0,
    totalPaidEgp: shipments?.reduce((sum, s) => sum + (s.total_paid_egp || 0), 0) || 0,
    totalBalanceEgp: shipments?.reduce((sum, s) => sum + (s.balance_egp || 0), 0) || 0,
  };

  const createMutation = useMutation({
    mutationFn: async (data: Omit<ShipmentPayment, "id" | "created_at" | "updated_at">) => {
      const { error } = await supabase.from("shipment_payments").insert([data]);
      if (error) throw error;

      // Update shipment totals
      const shipment = shipments?.find((s) => s.id === data.shipment_id);
      if (shipment) {
        const newTotalPaid = (shipment.total_paid_egp || 0) + data.amount_egp;
        const newBalance = (shipment.final_total_cost_egp || 0) - newTotalPaid;
        await supabase
          .from("shipments")
          .update({
            total_paid_egp: newTotalPaid,
            balance_egp: newBalance,
            last_payment_date: data.payment_date,
          })
          .eq("id", data.shipment_id);
      }
    },
    onSuccess: () => {
      toast({ title: "تم تسجيل الدفعة بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["shipments"] });
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: error.message || "حدث خطأ", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setSelectedShipmentId(null);
    setPaymentCurrency("EGP");
    setPaymentMethod("");
    setCostComponent("");
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
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

    const amountOriginal = parseFloat(formData.get("amountOriginal") as string) || 0;
    const exchangeRate = parseFloat(formData.get("exchangeRateToEgp") as string) || 1;
    const amountEgp = paymentCurrency === "EGP" ? amountOriginal : amountOriginal * exchangeRate;

    const data = {
      shipment_id: selectedShipmentId,
      payment_date: formData.get("paymentDate") as string,
      payment_currency: paymentCurrency,
      amount_original: amountOriginal,
      exchange_rate_to_egp: paymentCurrency === "RMB" ? exchangeRate : null,
      amount_egp: amountEgp,
      cost_component: costComponent,
      payment_method: paymentMethod,
      cash_receiver_name: (formData.get("cashReceiverName") as string) || null,
      reference_number: (formData.get("referenceNumber") as string) || null,
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
    setExpandedShipments((prev) => {
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
    if (
      search &&
      !s.shipment_name.toLowerCase().includes(search.toLowerCase()) &&
      !s.shipment_code.toLowerCase().includes(search.toLowerCase())
    ) {
      return false;
    }
    if (statusFilter && statusFilter !== "all" && s.status !== statusFilter) {
      return false;
    }
    if (dateFrom) {
      const purchaseDate = s.purchase_date ? new Date(s.purchase_date) : null;
      if (!purchaseDate || purchaseDate < new Date(dateFrom)) return false;
    }
    if (dateTo) {
      const purchaseDate = s.purchase_date ? new Date(s.purchase_date) : null;
      if (!purchaseDate || purchaseDate > new Date(dateTo)) return false;
    }
    return true;
  });

  const totalPagesShipments = Math.ceil((filteredShipments?.length || 0) / ITEMS_PER_PAGE);
  const startIndexShipments = (currentPageShipments - 1) * ITEMS_PER_PAGE;
  const endIndexShipments = startIndexShipments + ITEMS_PER_PAGE;
  const paginatedShipments = filteredShipments?.slice(startIndexShipments, endIndexShipments);

  const filteredPayments = payments?.filter((p) => {
    const shipment = shipments?.find((s) => s.id === p.shipment_id);
    if (
      search &&
      shipment &&
      !shipment.shipment_name.toLowerCase().includes(search.toLowerCase()) &&
      !shipment.shipment_code.toLowerCase().includes(search.toLowerCase())
    ) {
      return false;
    }
    if (statusFilter && statusFilter !== "all" && shipment && shipment.status !== statusFilter) {
      return false;
    }
    if (dateFrom) {
      const paymentDate = p.payment_date ? new Date(p.payment_date) : null;
      if (!paymentDate || paymentDate < new Date(dateFrom)) return false;
    }
    if (dateTo) {
      const paymentDate = p.payment_date ? new Date(p.payment_date) : null;
      if (!paymentDate || paymentDate > new Date(dateTo)) return false;
    }
    return true;
  });

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
                <Select
                  value={selectedShipmentId?.toString() || ""}
                  onValueChange={(v) => setSelectedShipmentId(parseInt(v))}
                >
                  <SelectTrigger data-testid="select-shipment">
                    <SelectValue placeholder="اختر الشحنة" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeShipments?.map((s) => (
                      <SelectItem key={s.id} value={s.id.toString()}>
                        {s.shipment_code} - {s.shipment_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="amountOriginal">المبلغ *</Label>
                  <Input
                    id="amountOriginal"
                    name="amountOriginal"
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    data-testid="input-amount"
                  />
                </div>
                {paymentCurrency === "RMB" && (
                  <div className="space-y-2">
                    <Label htmlFor="exchangeRateToEgp">سعر الصرف</Label>
                    <Input
                      id="exchangeRateToEgp"
                      name="exchangeRateToEgp"
                      type="number"
                      step="0.0001"
                      min="0"
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
                    {PAYMENT_METHODS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {paymentMethod === "نقدي" && (
                <div className="space-y-2">
                  <Label htmlFor="cashReceiverName">اسم المستلم</Label>
                  <Input
                    id="cashReceiverName"
                    name="cashReceiverName"
                    data-testid="input-receiver-name"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="referenceNumber">رقم المرجع</Label>
                <Input
                  id="referenceNumber"
                  name="referenceNumber"
                  data-testid="input-reference"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="note">ملاحظات</Label>
                <Textarea id="note" name="note" data-testid="input-note" />
              </div>

              <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                {createMutation.isPending ? "جاري الحفظ..." : "حفظ الدفعة"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="إجمالي التكلفة"
          value={`${formatCurrency(stats.totalCostEgp)} ج.م`}
          icon={DollarSign}
        />
        <StatCard
          title="إجمالي المدفوع"
          value={`${formatCurrency(stats.totalPaidEgp)} ج.م`}
          icon={TrendingUp}
          trend="up"
        />
        <StatCard
          title="إجمالي المتبقي"
          value={`${formatCurrency(stats.totalBalanceEgp)} ج.م`}
          icon={TrendingDown}
          trend="down"
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="shipments" className="space-y-4">
        <TabsList>
          <TabsTrigger value="shipments">الشحنات والأرصدة</TabsTrigger>
          <TabsTrigger value="ledger">سجل المدفوعات</TabsTrigger>
        </TabsList>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="بحث..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pr-10"
                />
              </div>
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="حالة الشحنة" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">جميع الحالات</SelectItem>
                    <SelectItem value="جديدة">جديدة</SelectItem>
                    <SelectItem value="في انتظار الشحن">في انتظار الشحن</SelectItem>
                    <SelectItem value="جاهزة للاستلام">جاهزة للاستلام</SelectItem>
                    <SelectItem value="مستلمة بنجاح">مستلمة بنجاح</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-[140px]"
                />
                <span className="text-muted-foreground">-</span>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-[140px]"
                />
              </div>
              {(search || statusFilter !== "all" || dateFrom || dateTo) && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  مسح الفلاتر
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Shipments Tab */}
        <TabsContent value="shipments">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Ship className="w-5 h-5" />
                الشحنات والأرصدة
                {filteredShipments && (
                  <Badge variant="secondary" className="mr-2">
                    {filteredShipments.length}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingShipments ? (
                <TableSkeleton />
              ) : paginatedShipments && paginatedShipments.length > 0 ? (
                <div className="space-y-4">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-8"></TableHead>
                          <TableHead className="text-right">رقم الشحنة</TableHead>
                          <TableHead className="text-right">اسم الشحنة</TableHead>
                          <TableHead className="text-right">الحالة</TableHead>
                          <TableHead className="text-right">التكلفة (ج.م)</TableHead>
                          <TableHead className="text-right">المدفوع (ج.م)</TableHead>
                          <TableHead className="text-right">المتبقي</TableHead>
                          <TableHead className="text-right">آخر دفعة</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedShipments.map((shipment) => {
                          const shipmentPayments = payments?.filter(
                            (p) => p.shipment_id === shipment.id
                          );
                          const isExpanded = expandedShipments.has(shipment.id);
                          return (
                            <Fragment key={shipment.id}>
                              <TableRow className="hover-elevate">
                                <TableCell>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => toggleShipmentExpand(shipment.id)}
                                    disabled={!shipmentPayments?.length}
                                  >
                                    {isExpanded ? (
                                      <ChevronUp className="w-4 h-4" />
                                    ) : (
                                      <ChevronDown className="w-4 h-4" />
                                    )}
                                  </Button>
                                </TableCell>
                                <TableCell className="font-medium">
                                  {shipment.shipment_code}
                                </TableCell>
                                <TableCell>{shipment.shipment_name}</TableCell>
                                <TableCell>
                                  <Badge
                                    variant="outline"
                                    className={shipmentStatusColors[shipment.status] || ""}
                                  >
                                    {shipment.status}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  {formatCurrency(shipment.final_total_cost_egp)}
                                </TableCell>
                                <TableCell>
                                  {formatCurrency(shipment.total_paid_egp)}
                                </TableCell>
                                <TableCell>
                                  <BalanceBadge
                                    cost={shipment.final_total_cost_egp}
                                    paid={shipment.total_paid_egp}
                                  />
                                </TableCell>
                                <TableCell>
                                  {formatDate(shipment.last_payment_date)}
                                </TableCell>
                              </TableRow>
                              {isExpanded &&
                                shipmentPayments?.map((payment) => (
                                  <TableRow
                                    key={payment.id}
                                    className="bg-muted/30"
                                  >
                                    <TableCell></TableCell>
                                    <TableCell colSpan={2}>
                                      <div className="flex items-center gap-2 text-sm">
                                        <Calendar className="w-3 h-3" />
                                        {formatDate(payment.payment_date)}
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      <Badge variant="outline">{payment.cost_component}</Badge>
                                    </TableCell>
                                    <TableCell>
                                      {payment.payment_currency === "RMB"
                                        ? `¥ ${formatCurrency(payment.amount_original)}`
                                        : "-"}
                                    </TableCell>
                                    <TableCell>
                                      {formatCurrency(payment.amount_egp)} ج.م
                                    </TableCell>
                                    <TableCell>
                                      <Badge variant="secondary">{payment.payment_method}</Badge>
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                      {payment.note || "-"}
                                    </TableCell>
                                  </TableRow>
                                ))}
                            </Fragment>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Pagination */}
                  {totalPagesShipments > 1 && (
                    <div className="flex justify-center gap-2 pt-4 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setCurrentPageShipments(Math.max(1, currentPageShipments - 1))
                        }
                        disabled={currentPageShipments === 1}
                      >
                        السابق
                      </Button>
                      <span className="flex items-center px-4 text-sm">
                        صفحة {currentPageShipments} من {totalPagesShipments}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setCurrentPageShipments(
                            Math.min(totalPagesShipments, currentPageShipments + 1)
                          )
                        }
                        disabled={currentPageShipments === totalPagesShipments}
                      >
                        التالي
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <EmptyState />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Ledger Tab */}
        <TabsContent value="ledger">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="w-5 h-5" />
                سجل المدفوعات
                {filteredPayments && (
                  <Badge variant="secondary" className="mr-2">
                    {filteredPayments.length}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingPayments ? (
                <TableSkeleton />
              ) : paginatedPayments && paginatedPayments.length > 0 ? (
                <div className="space-y-4">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-right">التاريخ</TableHead>
                          <TableHead className="text-right">الشحنة</TableHead>
                          <TableHead className="text-right">البند</TableHead>
                          <TableHead className="text-right">المبلغ</TableHead>
                          <TableHead className="text-right">طريقة الدفع</TableHead>
                          <TableHead className="text-right">ملاحظات</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedPayments.map((payment) => {
                          const shipment = shipments?.find(
                            (s) => s.id === payment.shipment_id
                          );
                          return (
                            <TableRow key={payment.id}>
                              <TableCell>{formatDate(payment.payment_date)}</TableCell>
                              <TableCell>
                                {shipment?.shipment_code || "-"}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">{payment.cost_component}</Badge>
                              </TableCell>
                              <TableCell>
                                {formatCurrency(payment.amount_egp)} ج.م
                              </TableCell>
                              <TableCell>
                                <Badge variant="secondary">{payment.payment_method}</Badge>
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {payment.note || "-"}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Pagination */}
                  {totalPagesPayments > 1 && (
                    <div className="flex justify-center gap-2 pt-4 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setCurrentPagePayments(Math.max(1, currentPagePayments - 1))
                        }
                        disabled={currentPagePayments === 1}
                      >
                        السابق
                      </Button>
                      <span className="flex items-center px-4 text-sm">
                        صفحة {currentPagePayments} من {totalPagesPayments}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setCurrentPagePayments(
                            Math.min(totalPagesPayments, currentPagePayments + 1)
                          )
                        }
                        disabled={currentPagePayments === totalPagesPayments}
                      >
                        التالي
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <EmptyState />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
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
  icon: any;
  trend?: "up" | "down";
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
          </div>
          <div
            className={`p-3 rounded-full ${
              trend === "up"
                ? "bg-green-100 text-green-600"
                : trend === "down"
                ? "bg-red-100 text-red-600"
                : "bg-muted"
            }`}
          >
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function BalanceBadge({ cost, paid }: { cost: number | null; paid: number | null }) {
  const costNum = cost || 0;
  const paidNum = paid || 0;
  const balance = costNum - paidNum;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("ar-EG", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  if (balance <= 0) {
    return (
      <Badge variant="default" className="bg-green-500">
        مسددة
      </Badge>
    );
  }

  return (
    <span className="text-destructive font-medium">{formatCurrency(balance)} ج.م</span>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <CreditCard className="w-16 h-16 text-muted-foreground mb-4" />
      <h3 className="text-lg font-medium mb-2">لا توجد بيانات</h3>
      <p className="text-muted-foreground">لم يتم العثور على أي بيانات</p>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4, 5].map((i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}
