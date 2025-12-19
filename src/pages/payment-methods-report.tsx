import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  CreditCard, 
  Filter,
  Download,
  Banknote,
  Smartphone,
  Building2,
  CircleDollarSign,
  HelpCircle,
} from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, Cell } from "recharts";

interface PaymentMethodData {
  paymentMethod: string;
  paymentCount: number;
  totalAmountEgp: string;
}

function formatCurrency(value: string | number) {
  const num = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("ar-EG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num || 0);
}

const methodIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  "نقدي": Banknote,
  "فودافون كاش": Smartphone,
  "إنستاباي": Smartphone,
  "تحويل بنكي": Building2,
  "أخرى": CircleDollarSign,
};

const methodColors: Record<string, string> = {
  "نقدي": "hsl(var(--chart-1))",
  "فودافون كاش": "hsl(var(--chart-2))",
  "إنستاباي": "hsl(var(--chart-3))",
  "تحويل بنكي": "hsl(var(--chart-4))",
  "أخرى": "hsl(var(--chart-5))",
};

export default function PaymentMethodsReportPage() {
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  const queryParams = new URLSearchParams();
  if (dateFrom) queryParams.append("dateFrom", dateFrom);
  if (dateTo) queryParams.append("dateTo", dateTo);

  const { data: report, isLoading } = useQuery<PaymentMethodData[]>({
    queryKey: ["/api/accounting/payment-methods-report", dateFrom, dateTo],
    queryFn: async () => {
      const response = await fetch(`/api/accounting/payment-methods-report?${queryParams.toString()}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch");
      return response.json();
    },
  });

  const clearFilters = () => {
    setDateFrom("");
    setDateTo("");
  };

  const exportToCSV = () => {
    if (!report) return;
    
    const headers = ["طريقة الدفع", "عدد الدفعات", "إجمالي المبلغ"];
    const rows = report.map(r => [
      r.paymentMethod,
      r.paymentCount.toString(),
      r.totalAmountEgp
    ]);
    
    const csvContent = [headers, ...rows].map(row => row.join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `payment-methods-report-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  const chartData = report?.map(r => ({
    name: r.paymentMethod,
    value: parseFloat(r.totalAmountEgp),
    color: methodColors[r.paymentMethod] || "hsl(var(--chart-1))",
  })) || [];

  const totalAmount = report?.reduce((sum, r) => sum + parseFloat(r.totalAmountEgp), 0) || 0;
  const totalCount = report?.reduce((sum, r) => sum + r.paymentCount, 0) || 0;

  if (isLoading) {
    return (
      <div className="p-6 space-y-6" dir="rtl">
        <h1 className="text-2xl font-bold">تقرير حركة المدفوعات حسب وسيلة الدفع</h1>
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <CreditCard className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">تقرير حركة المدفوعات</h1>
            <p className="text-muted-foreground text-sm">حسب وسيلة الدفع</p>
          </div>
        </div>
        <Button onClick={exportToCSV} data-testid="button-export-csv">
          <Download className="w-4 h-4 ml-2" />
          تصدير Excel/CSV
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Filter className="w-5 h-5" />
            الفلاتر
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
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
            <div className="flex items-end">
              <Button variant="outline" onClick={clearFilters} data-testid="button-clear-filters">
                مسح الفلاتر
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              ملخص المدفوعات
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center p-3 bg-muted rounded-md">
              <span className="text-muted-foreground">إجمالي عدد الدفعات</span>
              <span className="text-xl font-bold" data-testid="text-total-count">{totalCount}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-primary/5 rounded-md">
              <span className="text-muted-foreground">إجمالي المبلغ المدفوع</span>
              <span className="text-xl font-bold text-primary" data-testid="text-total-amount">
                {formatCurrency(totalAmount)} جنيه
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HelpCircle className="w-5 h-5" />
              الرسم البياني
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} layout="vertical">
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12 }} />
                <RechartsTooltip
                  formatter={(value: number) => [`${formatCurrency(value)} جنيه`, "المبلغ"]}
                  contentStyle={{ direction: "rtl" }}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            تفاصيل وسائل الدفع
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">طريقة الدفع</TableHead>
                <TableHead className="text-right">إجمالي عدد الدفعات</TableHead>
                <TableHead className="text-right">إجمالي المبلغ المدفوع</TableHead>
                <TableHead className="text-right">نسبة من الإجمالي</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    لا توجد بيانات
                  </TableCell>
                </TableRow>
              ) : (
                report?.map((r) => {
                  const Icon = methodIcons[r.paymentMethod] || CircleDollarSign;
                  const percentage = totalAmount > 0 
                    ? ((parseFloat(r.totalAmountEgp) / totalAmount) * 100).toFixed(1)
                    : "0";
                  return (
                    <TableRow key={r.paymentMethod} data-testid={`row-method-${r.paymentMethod}`}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Icon className="w-5 h-5 text-muted-foreground" />
                          {r.paymentMethod}
                        </div>
                      </TableCell>
                      <TableCell>{r.paymentCount} دفعة</TableCell>
                      <TableCell className="text-green-600 font-medium">
                        {formatCurrency(r.totalAmountEgp)} جنيه
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                          <span className="text-sm text-muted-foreground">{percentage}%</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
