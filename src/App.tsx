import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/hooks/useAuth";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Dashboard from "@/pages/dashboard";
import Shipments from "@/pages/shipments";
import ShipmentWizard from "@/pages/shipment-wizard";
import Suppliers from "@/pages/suppliers";
import ProductTypes from "@/pages/product-types";
import ExchangeRates from "@/pages/exchange-rates";
import Payments from "@/pages/payments";
import Inventory from "@/pages/inventory";
import UsersPage from "@/pages/users";
import AccountingPage from "@/pages/accounting";
import SupplierBalancesPage from "@/pages/supplier-balances";
import MovementReportPage from "@/pages/movement-report";
import PaymentMethodsReportPage from "@/pages/payment-methods-report";
import { Skeleton } from "@/components/ui/skeleton";

function AuthenticatedRouter() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/shipments" component={Shipments} />
      <Route path="/shipments/new" component={ShipmentWizard} />
      <Route path="/shipments/:id" component={ShipmentWizard} />
      <Route path="/shipments/:id/edit" component={ShipmentWizard} />
      <Route path="/suppliers" component={Suppliers} />
      <Route path="/product-types" component={ProductTypes} />
      <Route path="/exchange-rates" component={ExchangeRates} />
      <Route path="/payments" component={Payments} />
      <Route path="/inventory" component={Inventory} />
      <Route path="/users" component={UsersPage} />
      <Route path="/accounting" component={AccountingPage} />
      <Route path="/supplier-balances" component={SupplierBalancesPage} />
      <Route path="/movement-report" component={MovementReportPage} />
      <Route path="/payment-methods-report" component={PaymentMethodsReportPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthenticatedLayout() {
  const style = {
    "--sidebar-width": "18rem",
    "--sidebar-width-icon": "4rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="sticky top-0 z-50 flex items-center justify-between gap-4 p-3 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <ThemeToggle />
          </header>
          <main className="flex-1 overflow-auto">
            <AuthenticatedRouter />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="space-y-4 text-center">
        <div className="w-16 h-16 rounded-lg bg-primary/10 flex items-center justify-center mx-auto">
          <Skeleton className="w-10 h-10 rounded" />
        </div>
        <Skeleton className="h-6 w-32 mx-auto" />
        <Skeleton className="h-4 w-48 mx-auto" />
      </div>
    </div>
  );
}

function AppContent() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Landing />;
  }

  return <AuthenticatedLayout />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppContent />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
