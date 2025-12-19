import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Ship,
  Plus,
  Search,
  Filter,
  Eye,
  Edit,
  Trash2,
  ChevronDown,
  Calendar,
  Archive,
  ArchiveRestore,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { paymentStatusColors, shipmentStatusColors } from "@/lib/colorMaps";
import { supabase } from "@/integrations/supabase/client";
import type { Shipment } from "@/types/database";

export default function Shipments() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [shipmentToDelete, setShipmentToDelete] = useState<Shipment | null>(null);
  const [viewArchived, setViewArchived] = useState(false);
  const { toast } = useToast();

  const { data: shipments, isLoading } = useQuery({
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

  const activeShipments = shipments?.filter((shipment) => shipment.status !== "مؤرشفة");
  const archivedShipments = shipments?.filter((shipment) => shipment.status === "مؤرشفة");

  useEffect(() => {
    setStatusFilter("all");
    setPaymentStatusFilter("all");
  }, [viewArchived]);

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("shipments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "تم حذف الشحنة بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["shipments"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      setDeleteDialogOpen(false);
      setShipmentToDelete(null);
    },
    onError: () => {
      toast({ title: "حدث خطأ أثناء حذف الشحنة", variant: "destructive" });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const { error } = await supabase
        .from("shipments")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: viewArchived ? "تم إلغاء الأرشفة" : "تمت أرشفة الشحنة" });
      queryClient.invalidateQueries({ queryKey: ["shipments"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: () => {
      toast({ title: "تعذر تحديث حالة الشحنة", variant: "destructive" });
    },
  });

  const handleDeleteClick = (shipment: Shipment) => {
    setShipmentToDelete(shipment);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (shipmentToDelete) {
      deleteMutation.mutate(shipmentToDelete.id);
    }
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

  const getPaymentStatus = (shipment: Shipment) => {
    const cost = parseFloat(String(shipment.final_total_cost_egp || 0));
    const paid = parseFloat(String(shipment.total_paid_egp || 0));
    if (paid <= 0) return "لم يتم دفع أي مبلغ";
    if (paid >= cost) return "مسددة بالكامل";
    return "مدفوعة جزئياً";
  };

  const baseShipments = viewArchived ? archivedShipments : activeShipments;

  const filteredShipments = baseShipments?.filter((shipment) => {
    const matchesSearch =
      !search ||
      shipment.shipment_name.toLowerCase().includes(search.toLowerCase()) ||
      shipment.shipment_code.toLowerCase().includes(search.toLowerCase());
    const matchesStatus =
      statusFilter === "all" || shipment.status === statusFilter;

    const paymentStatus = getPaymentStatus(shipment);
    const matchesPaymentStatus =
      paymentStatusFilter === "all" || paymentStatus === paymentStatusFilter;
    
    let matchesDateRange = true;
    if (dateFrom || dateTo) {
      const purchaseDate = shipment.purchase_date ? new Date(shipment.purchase_date) : null;
      if (purchaseDate) {
        if (dateFrom) {
          const fromDate = new Date(dateFrom);
          if (purchaseDate < fromDate) matchesDateRange = false;
        }
        if (dateTo) {
          const toDate = new Date(dateTo);
          toDate.setHours(23, 59, 59, 999);
          if (purchaseDate > toDate) matchesDateRange = false;
        }
      }
    }
    
    return matchesSearch && matchesStatus && matchesPaymentStatus && matchesDateRange;
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">{viewArchived ? "الشحنات المؤرشفة" : "الشحنات"}</h1>
          <p className="text-muted-foreground mt-1">
            إدارة جميع الشحنات من لحظة الشراء حتى الاستلام
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border overflow-hidden">
            <Button
              type="button"
              variant={viewArchived ? "outline" : "default"}
              className="rounded-none"
              onClick={() => setViewArchived(false)}
            >
              الشحنات النشطة
            </Button>
            <Button
              type="button"
              variant={viewArchived ? "default" : "outline"}
              className="rounded-none"
              onClick={() => setViewArchived(true)}
            >
              الشحنات المؤرشفة
            </Button>
          </div>
          <Button asChild data-testid="button-add-shipment">
            <Link href="/shipments/new">
              <Plus className="w-4 h-4 ml-2" />
              إضافة شحنة جديدة
            </Link>
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="بحث برقم أو اسم الشحنة..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pr-10"
                data-testid="input-search-shipments"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]" data-testid="select-status-filter">
                  <SelectValue placeholder="حالة الشحنة" />
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
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <Select value={paymentStatusFilter} onValueChange={setPaymentStatusFilter}>
                <SelectTrigger className="w-[200px]" data-testid="select-payment-status-filter">
                  <SelectValue placeholder="حالة السداد" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="لم يتم دفع أي مبلغ">لم يتم دفع أي مبلغ</SelectItem>
                  <SelectItem value="مدفوعة جزئياً">مدفوعة جزئياً</SelectItem>
                  <SelectItem value="مسددة بالكامل">مسددة بالكامل</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <div className="flex items-center gap-2">
                <Label className="text-sm text-muted-foreground whitespace-nowrap">من:</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-[140px]"
                  data-testid="input-date-from"
                />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-sm text-muted-foreground whitespace-nowrap">إلى:</Label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-[140px]"
                  data-testid="input-date-to"
                />
              </div>
              {(dateFrom || dateTo) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDateFrom("");
                    setDateTo("");
                  }}
                >
                  مسح التاريخ
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Shipments Table */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Ship className="w-5 h-5" />
            قائمة الشحنات
            {filteredShipments && (
              <Badge variant="secondary" className="mr-2">
                {filteredShipments.length}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <TableSkeleton />
          ) : filteredShipments && filteredShipments.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">رقم الشحنة</TableHead>
                    <TableHead className="text-right">اسم الشحنة</TableHead>
                    <TableHead className="text-right">تاريخ الشراء</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                    <TableHead className="text-right">حالة السداد</TableHead>
                    <TableHead className="text-right">التكلفة (ج.م)</TableHead>
                    <TableHead className="text-right">المدفوع (ج.م)</TableHead>
                    <TableHead className="text-right">الرصيد</TableHead>
                    <TableHead className="text-right">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredShipments.map((shipment) => (
                    <TableRow
                      key={shipment.id}
                      className="hover-elevate"
                      data-testid={`row-shipment-${shipment.id}`}
                    >
                      <TableCell className="font-medium">
                        {shipment.shipment_code}
                      </TableCell>
                      <TableCell>{shipment.shipment_name}</TableCell>
                      <TableCell>{formatDate(shipment.purchase_date)}</TableCell>
                      <TableCell>
                        <StatusBadge status={shipment.status} />
                      </TableCell>
                      <TableCell>
                        <PaymentStatusBadge status={getPaymentStatus(shipment)} />
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
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              إجراءات
                              <ChevronDown className="w-4 h-4 mr-1" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/shipments/${shipment.id}`}>
                                <Eye className="w-4 h-4 ml-2" />
                                عرض
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/shipments/${shipment.id}/edit`}>
                                <Edit className="w-4 h-4 ml-2" />
                                تعديل
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                statusMutation.mutate({
                                  id: shipment.id,
                                  status: shipment.status === "مؤرشفة" ? "جديدة" : "مؤرشفة",
                                })
                              }
                            >
                              {shipment.status === "مؤرشفة" ? (
                                <ArchiveRestore className="w-4 h-4 ml-2" />
                              ) : (
                                <Archive className="w-4 h-4 ml-2" />
                              )}
                              {shipment.status === "مؤرشفة" ? "إلغاء الأرشفة" : "أرشفة"}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => handleDeleteClick(shipment)}
                            >
                              <Trash2 className="w-4 h-4 ml-2" />
                              حذف
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <EmptyState />
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد حذف الشحنة</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف الشحنة "{shipmentToDelete?.shipment_name}"؟
              <br />
              هذا الإجراء لا يمكن التراجع عنه.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "جاري الحذف..." : "حذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={shipmentStatusColors[status] || ""}>
      {status}
    </Badge>
  );
}

function PaymentStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={paymentStatusColors[status] || ""}>
      {status}
    </Badge>
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
    <span className="text-destructive font-medium">
      {formatCurrency(balance)} ج.م
    </span>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Ship className="w-16 h-16 text-muted-foreground mb-4" />
      <h3 className="text-lg font-medium mb-2">لا توجد شحنات</h3>
      <p className="text-muted-foreground mb-4">
        لم يتم العثور على أي شحنات. ابدأ بإضافة شحنة جديدة.
      </p>
      <Button asChild>
        <Link href="/shipments/new">
          <Plus className="w-4 h-4 ml-2" />
          إضافة شحنة جديدة
        </Link>
      </Button>
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
