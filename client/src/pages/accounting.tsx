import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Calculator, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Ship, 
  Package, 
  Truck, 
  FileText,
  AlertCircle,
  HelpCircle,
  Filter,
  RefreshCw,
  Boxes,
  Receipt,
} from "lucide-react";
import type { Supplier, ExchangeRate } from "@shared/schema";

interface AccountingDashboard {
  totalPurchaseRmb: string;
  totalPurchaseEgp: string;
  totalDiscountRmb: string;
  totalShippingRmb: string;
  totalShippingEgp: string;
  totalCommissionRmb: string;
  totalCommissionEgp: string;
  totalCustomsEgp: string;
  totalTakhreegEgp: string;
  totalCostEgp: string;
  totalCostRmb: string;
  totalPaidEgp: string;
  totalPaidRmb: string;
  totalBalanceEgp: string;
  totalBalanceRmb: string;
  totalCartons: number;
  totalPieces: number;
  unsettledShipmentsCount: number;
  shipmentsCount: number;
  totalPaidShippingRmb: string;
  totalBalanceShippingRmb: string;
  totalPaidShippingEgp: string;
  totalBalanceShippingEgp: string;
  totalPaidCommissionRmb: string;
  totalBalanceCommissionRmb: string;
  totalPaidCommissionEgp: string;
  totalBalanceCommissionEgp: string;
  totalPaidPurchaseRmb: string;
  totalBalancePurchaseRmb: string;
  totalPaidPurchaseEgp: string;
  totalBalancePurchaseEgp: string;
  totalPaidCustomsEgp: string;
  totalBalanceCustomsEgp: string;
  totalPaidTakhreegEgp: string;
  totalBalanceTakhreegEgp: string;
}

function formatCurrency(value: string | number, currency: string = "EGP") {
  const num = typeof value === "string" ? parseFloat(value) : value;
  const formatted = new Intl.NumberFormat("ar-EG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num || 0);
  return `${formatted} ${currency === "RMB" ? "رممبي" : "جنيه"}`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ar-EG").format(value || 0);
}

export default function AccountingPage() {
  const { toast } = useToast();
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [supplierId, setSupplierId] = useState<string>("");
  const [shipmentCode, setShipmentCode] = useState<string>("");
  const [shipmentStatus, setShipmentStatus] = useState<string>("all");
  const [paymentStatus, setPaymentStatus] = useState<string>("all");
  const [includeArchived, setIncludeArchived] = useState(false);

  const queryParams = new URLSearchParams();
  if (dateFrom) queryParams.append("dateFrom", dateFrom);
  if (dateTo) queryParams.append("dateTo", dateTo);
  if (supplierId) queryParams.append("supplierId", supplierId);
  if (shipmentCode) queryParams.append("shipmentCode", shipmentCode);
  if (shipmentStatus && shipmentStatus !== "all") queryParams.append("shipmentStatus", shipmentStatus);
  if (paymentStatus && paymentStatus !== "all") queryParams.append("paymentStatus", paymentStatus);
  if (includeArchived) queryParams.append("includeArchived", "true");

  const { data: stats, isLoading } = useQuery<AccountingDashboard>({
    queryKey: ["/api/accounting/dashboard", dateFrom, dateTo, supplierId, shipmentCode, shipmentStatus, paymentStatus, includeArchived],
    queryFn: async () => {
      const response = await fetch(`/api/accounting/dashboard?${queryParams.toString()}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch");
      return response.json();
    },
  });

  const { data: suppliers } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers"],
  });

  const { data: exchangeRates } = useQuery<ExchangeRate[]>({
    queryKey: ["/api/exchange-rates"],
  });

  const latestRmbRate = exchangeRates?.find(
    (rate) => rate.fromCurrency === "RMB" && rate.toCurrency === "EGP",
  );

  const refreshRatesMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/exchange-rates/refresh", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exchange-rates"] });
      toast({ title: "تم تحديث سعر الصرف بنجاح" });
    },
    onError: () => {
      toast({ title: "تعذر تحديث سعر الصرف", variant: "destructive" });
    },
  });

  const clearFilters = () => {
    setDateFrom("");
    setDateTo("");
    setSupplierId("");
    setShipmentCode("");
    setShipmentStatus("all");
    setPaymentStatus("all");
    setIncludeArchived(false);
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6" dir="rtl">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-2xl font-bold">المحاسبة</h1>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Calculator className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">المحاسبة</h1>
            <p className="text-muted-foreground text-sm">ملخص التكاليف والمدفوعات</p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Filter className="w-5 h-5" />
            الفلاتر
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label>رقم الشحنة</Label>
              <Input
                type="text"
                placeholder="ادخل رقم الشحنة"
                value={shipmentCode}
                onChange={(e) => setShipmentCode(e.target.value)}
                data-testid="input-shipment-code"
              />
            </div>
            <div className="space-y-2">
              <Label>من تاريخ</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                data-testid="input-date-from"
              />
            </div>
            <div className="space-y-2">
              <Label>إلى تاريخ</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                data-testid="input-date-to"
              />
            </div>
            <div className="space-y-2">
              <Label>المورد</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger data-testid="select-supplier">
                  <SelectValue placeholder="جميع الموردين" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الموردين</SelectItem>
                  {suppliers?.map((s) => (
                    <SelectItem key={s.id} value={s.id.toString()}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>حالة الشحنة</Label>
              <Select value={shipmentStatus} onValueChange={setShipmentStatus}>
                <SelectTrigger data-testid="select-shipment-status">
                  <SelectValue placeholder="جميع الحالات" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الحالات</SelectItem>
                  <SelectItem value="جديدة">جديدة</SelectItem>
                  <SelectItem value="في انتظار الشحن">في انتظار الشحن</SelectItem>
                  <SelectItem value="جاهزة للاستلام">جاهزة للاستلام</SelectItem>
                  <SelectItem value="مستلمة بنجاح">مستلمة بنجاح</SelectItem>
                  <SelectItem value="مؤرشفة">مؤرشفة</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>حالة السداد</Label>
              <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                <SelectTrigger data-testid="select-payment-status">
                  <SelectValue placeholder="الكل" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="لم يتم دفع أي مبلغ">لم يتم دفع أي مبلغ</SelectItem>
                  <SelectItem value="مدفوعة جزئياً">مدفوعة جزئياً</SelectItem>
                  <SelectItem value="مسددة بالكامل">مسددة بالكامل</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>تضمين المؤرشفة</Label>
              <div className="flex items-center h-9">
                <Switch
                  checked={includeArchived}
                  onCheckedChange={setIncludeArchived}
                  data-testid="switch-include-archived"
                />
              </div>
            </div>
            <div className="flex items-end">
              <Button variant="outline" onClick={clearFilters} data-testid="button-clear-filters">
                مسح الفلاتر
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-muted/30">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Package className="w-5 h-5" />
              بيانات الشحنة
            </CardTitle>
            <div className="flex items-center gap-4">
              <div className="text-sm text-muted-foreground">
                سعر الصرف الحالي: <span className="font-bold">{latestRmbRate?.rateValue || "غير متوفر"}</span>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => refreshRatesMutation.mutate()}
                disabled={refreshRatesMutation.isPending}
                data-testid="button-refresh-exchange-rate"
              >
                <RefreshCw className={`w-4 h-4 ml-2 ${refreshRatesMutation.isPending ? "animate-spin" : ""}`} />
                {refreshRatesMutation.isPending ? "جاري التحديث..." : "تحديث سعر الصرف"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="bg-background p-4 rounded-md border">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                <Ship className="w-4 h-4" />
                عدد الشحنات
              </div>
              <div className="text-2xl font-bold" data-testid="text-shipments-count">
                {formatNumber(stats?.shipmentsCount || 0)}
              </div>
            </div>
            <div className="bg-background p-4 rounded-md border">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                <Boxes className="w-4 h-4" />
                إجمالي الكراتين
              </div>
              <div className="text-2xl font-bold" data-testid="text-total-cartons">
                {formatNumber(stats?.totalCartons || 0)}
              </div>
            </div>
            <div className="bg-background p-4 rounded-md border">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                <Package className="w-4 h-4" />
                إجمالي القطع
              </div>
              <div className="text-2xl font-bold" data-testid="text-total-pieces">
                {formatNumber(stats?.totalPieces || 0)}
              </div>
            </div>
            <div className="bg-amber-50 dark:bg-amber-950/30 p-4 rounded-md border border-amber-200 dark:border-amber-900">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-sm mb-1">
                <AlertCircle className="w-4 h-4" />
                شحنات غير مسددة
              </div>
              <div className="text-2xl font-bold text-amber-600" data-testid="text-unsettled-count">
                {stats?.unsettledShipmentsCount || 0}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Receipt className="w-5 h-5 text-primary" />
              التكاليف بالرممبي (RMB)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <CostItemCard
              title="قيمة الفواتير"
              icon={Package}
              value={stats?.totalPurchaseRmb || "0"}
              currency="RMB"
              paid={stats?.totalPaidPurchaseRmb || "0"}
              remaining={stats?.totalBalancePurchaseRmb || "0"}
            />
            <CostItemCard
              title="تكلفة الشحن"
              icon={Truck}
              value={stats?.totalShippingRmb || "0"}
              currency="RMB"
              paid={stats?.totalPaidShippingRmb || "0"}
              remaining={stats?.totalBalanceShippingRmb || "0"}
            />
            <CostItemCard
              title="العمولة"
              icon={DollarSign}
              value={stats?.totalCommissionRmb || "0"}
              currency="RMB"
              paid={stats?.totalPaidCommissionRmb || "0"}
              remaining={stats?.totalBalanceCommissionRmb || "0"}
            />
            <div className="bg-primary/10 p-4 rounded-md border border-primary/20 mt-4">
              <div className="flex items-center justify-between">
                <span className="font-bold">إجمالي التكاليف (RMB)</span>
                <span className="text-xl font-bold text-primary" data-testid="text-total-cost-rmb">
                  {formatCurrency(stats?.totalCostRmb || "0", "RMB")}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Receipt className="w-5 h-5 text-primary" />
              التكاليف بالجنيه (EGP)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <CostItemCard
              title="قيمة الفواتير"
              icon={Package}
              value={stats?.totalPurchaseEgp || "0"}
              currency="EGP"
              paid={stats?.totalPaidPurchaseEgp || "0"}
              remaining={stats?.totalBalancePurchaseEgp || "0"}
            />
            <CostItemCard
              title="تكلفة الشحن"
              icon={Truck}
              value={stats?.totalShippingEgp || "0"}
              currency="EGP"
              paid={stats?.totalPaidShippingEgp || "0"}
              remaining={stats?.totalBalanceShippingEgp || "0"}
            />
            <CostItemCard
              title="العمولة"
              icon={DollarSign}
              value={stats?.totalCommissionEgp || "0"}
              currency="EGP"
              paid={stats?.totalPaidCommissionEgp || "0"}
              remaining={stats?.totalBalanceCommissionEgp || "0"}
            />
            <CostItemCard
              title="الجمارك"
              icon={FileText}
              value={stats?.totalCustomsEgp || "0"}
              currency="EGP"
              paid={stats?.totalPaidCustomsEgp || "0"}
              remaining={stats?.totalBalanceCustomsEgp || "0"}
            />
            <CostItemCard
              title="التخريج"
              icon={Ship}
              value={stats?.totalTakhreegEgp || "0"}
              currency="EGP"
              paid={stats?.totalPaidTakhreegEgp || "0"}
              remaining={stats?.totalBalanceTakhreegEgp || "0"}
            />
            <div className="bg-primary/10 p-4 rounded-md border border-primary/20 mt-4">
              <div className="flex items-center justify-between">
                <span className="font-bold">إجمالي التكاليف (EGP)</span>
                <span className="text-xl font-bold text-primary" data-testid="text-total-cost-egp">
                  {formatCurrency(stats?.totalCostEgp || "0")}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <TrendingDown className="w-5 h-5 text-green-600" />
            ملخص المدفوعات والأرصدة
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  إجمالي المدفوع (RMB)
                  <Tooltip>
                    <TooltipTrigger>
                      <HelpCircle className="w-4 h-4 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      مجموع المدفوعات بالرممبي
                    </TooltipContent>
                  </Tooltip>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold text-green-600" data-testid="text-total-paid-rmb">
                  {formatCurrency(stats?.totalPaidRmb || "0", "RMB")}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  إجمالي المدفوع (EGP)
                  <Tooltip>
                    <TooltipTrigger>
                      <HelpCircle className="w-4 h-4 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      مجموع المدفوعات بالجنيه
                    </TooltipContent>
                  </Tooltip>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold text-green-600" data-testid="text-total-paid-egp">
                  {formatCurrency(stats?.totalPaidEgp || "0")}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  إجمالي المتبقي (RMB)
                  <Tooltip>
                    <TooltipTrigger>
                      <HelpCircle className="w-4 h-4 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      المبلغ المتبقي بالرممبي
                    </TooltipContent>
                  </Tooltip>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold text-amber-600" data-testid="text-total-balance-rmb">
                  {formatCurrency(stats?.totalBalanceRmb || "0", "RMB")}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  إجمالي المتبقي (EGP)
                  <Tooltip>
                    <TooltipTrigger>
                      <HelpCircle className="w-4 h-4 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      المبلغ المتبقي بالجنيه
                    </TooltipContent>
                  </Tooltip>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold text-amber-600" data-testid="text-total-balance-egp">
                  {formatCurrency(stats?.totalBalanceEgp || "0")}
                </div>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CostItemCard({
  title,
  icon: Icon,
  value,
  currency,
  paid,
  remaining,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  currency: "RMB" | "EGP";
  paid?: string;
  remaining?: string;
}) {
  return (
    <div className="bg-muted/50 p-3 rounded-md">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon className="w-4 h-4" />
          {title}
        </div>
        <span className="font-bold">{formatCurrency(value, currency)}</span>
      </div>
      {paid !== undefined && remaining !== undefined && (
        <div className="flex items-center justify-between text-xs mt-2 pt-2 border-t border-border/50">
          <span className="text-green-600">
            مدفوع: {formatCurrency(paid, currency)}
          </span>
          <span className="text-amber-600">
            متبقي: {formatCurrency(remaining, currency)}
          </span>
        </div>
      )}
    </div>
  );
}
