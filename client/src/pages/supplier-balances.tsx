import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Users, 
  TrendingUp, 
  TrendingDown, 
  Filter,
  FileText,
  ArrowUpDown,
} from "lucide-react";
import type { Supplier } from "@shared/schema";

interface SupplierBalance {
  supplierId: number;
  supplierName: string;
  totalCostEgp: string;
  totalPaidEgp: string;
  balanceEgp: string;
  balanceStatus: 'owing' | 'settled' | 'credit';
}

interface SupplierStatement {
  supplier: Supplier;
  movements: Array<{
    date: Date | string;
    type: 'shipment' | 'payment';
    description: string;
    shipmentCode?: string;
    costEgp?: string;
    paidEgp?: string;
    runningBalance: string;
  }>;
}

function formatCurrency(value: string | number) {
  const num = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("ar-EG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num || 0);
}

function formatDate(date: string | Date | null) {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("ar-EG");
}

export default function SupplierBalancesPage() {
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [supplierId, setSupplierId] = useState<string>("");
  const [balanceType, setBalanceType] = useState<string>("all");
  const [selectedSupplier, setSelectedSupplier] = useState<number | null>(null);

  const queryParams = new URLSearchParams();
  if (dateFrom) queryParams.append("dateFrom", dateFrom);
  if (dateTo) queryParams.append("dateTo", dateTo);
  if (supplierId && supplierId !== "all") queryParams.append("supplierId", supplierId);
  if (balanceType && balanceType !== "all") queryParams.append("balanceType", balanceType);

  const { data: balances, isLoading } = useQuery<SupplierBalance[]>({
    queryKey: ["/api/accounting/supplier-balances", dateFrom, dateTo, supplierId, balanceType],
    queryFn: async () => {
      const response = await fetch(`/api/accounting/supplier-balances?${queryParams.toString()}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch");
      return response.json();
    },
  });

  const { data: suppliers } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers"],
  });

  const statementQueryParams = new URLSearchParams();
  if (dateFrom) statementQueryParams.append("dateFrom", dateFrom);
  if (dateTo) statementQueryParams.append("dateTo", dateTo);

  const { data: statement, isLoading: statementLoading } = useQuery<SupplierStatement>({
    queryKey: ["/api/accounting/supplier-statement", selectedSupplier, dateFrom, dateTo],
    queryFn: async () => {
      const response = await fetch(
        `/api/accounting/supplier-statement/${selectedSupplier}?${statementQueryParams.toString()}`,
        { credentials: "include" }
      );
      if (!response.ok) throw new Error("Failed to fetch");
      return response.json();
    },
    enabled: !!selectedSupplier,
  });

  const clearFilters = () => {
    setDateFrom("");
    setDateTo("");
    setSupplierId("");
    setBalanceType("all");
  };

  const getBalanceStatusBadge = (status: string, balance: string) => {
    const balanceNum = parseFloat(balance);
    if (status === 'owing') {
      return (
        <Badge variant="destructive" className="gap-1">
          <TrendingUp className="w-3 h-3" />
          فلوس عليك: {formatCurrency(balanceNum)} جنيه
        </Badge>
      );
    }
    if (status === 'credit') {
      return (
        <Badge variant="default" className="gap-1 bg-green-600">
          <TrendingDown className="w-3 h-3" />
          فلوس ليك: {formatCurrency(Math.abs(balanceNum))} جنيه
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="gap-1">
        لا يوجد رصيد بينكم
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6" dir="rtl">
        <h1 className="text-2xl font-bold">كشف حساب الموردين</h1>
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
      <div className="flex items-center gap-3">
        <Users className="w-8 h-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">كشف حساب الموردين</h1>
          <p className="text-muted-foreground text-sm">الفلوس اللي عليك وليك لكل مورد</p>
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
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
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
              <Label>نوع الرصيد</Label>
              <Select value={balanceType} onValueChange={setBalanceType}>
                <SelectTrigger data-testid="select-balance-type">
                  <SelectValue placeholder="الكل" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="owing">فلوس عليك فقط</SelectItem>
                  <SelectItem value="credit">فلوس ليك فقط</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button variant="outline" onClick={clearFilters} data-testid="button-clear-filters">
                مسح الفلاتر
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowUpDown className="w-5 h-5" />
            أرصدة الموردين
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">اسم المورد</TableHead>
                <TableHead className="text-right">إجمالي تكلفة الشحنات</TableHead>
                <TableHead className="text-right">إجمالي المدفوع</TableHead>
                <TableHead className="text-right">الرصيد الحالي</TableHead>
                <TableHead className="text-right">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {balances?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    لا توجد بيانات
                  </TableCell>
                </TableRow>
              ) : (
                balances?.map((balance) => (
                  <TableRow key={balance.supplierId} data-testid={`row-supplier-${balance.supplierId}`}>
                    <TableCell className="font-medium">{balance.supplierName}</TableCell>
                    <TableCell>{formatCurrency(balance.totalCostEgp)} جنيه</TableCell>
                    <TableCell className="text-green-600">
                      {formatCurrency(balance.totalPaidEgp)} جنيه
                    </TableCell>
                    <TableCell>
                      {getBalanceStatusBadge(balance.balanceStatus, balance.balanceEgp)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedSupplier(balance.supplierId)}
                        data-testid={`button-view-statement-${balance.supplierId}`}
                      >
                        <FileText className="w-4 h-4 ml-1" />
                        كشف الحساب
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!selectedSupplier} onOpenChange={() => setSelectedSupplier(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              كشف حساب: {statement?.supplier?.name}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            {statementLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">التاريخ</TableHead>
                    <TableHead className="text-right">البيان</TableHead>
                    <TableHead className="text-right">رقم الشحنة</TableHead>
                    <TableHead className="text-right">تكلفة</TableHead>
                    <TableHead className="text-right">مدفوع</TableHead>
                    <TableHead className="text-right">الرصيد</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {statement?.movements?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        لا توجد حركات
                      </TableCell>
                    </TableRow>
                  ) : (
                    statement?.movements?.map((m, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{formatDate(m.date)}</TableCell>
                        <TableCell>
                          <Badge variant={m.type === 'shipment' ? 'secondary' : 'default'}>
                            {m.description}
                          </Badge>
                        </TableCell>
                        <TableCell>{m.shipmentCode || "-"}</TableCell>
                        <TableCell className="text-red-600">
                          {m.costEgp ? `${formatCurrency(m.costEgp)} جنيه` : "-"}
                        </TableCell>
                        <TableCell className="text-green-600">
                          {m.paidEgp ? `${formatCurrency(m.paidEgp)} جنيه` : "-"}
                        </TableCell>
                        <TableCell className="font-medium">
                          {formatCurrency(m.runningBalance)} جنيه
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
