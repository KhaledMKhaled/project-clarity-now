import { useState } from "react";
import { Ship, Package, CreditCard, BarChart3, Shield, Globe, Loader2, Lock, Mail, User, ArrowLeft, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function Landing() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<"login" | "signup">("login");
  const { toast } = useToast();
  const { signIn, signUp } = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast({
        title: "خطأ",
        description: "يرجى إدخال البريد الإلكتروني وكلمة المرور",
        variant: "destructive",
      });
      return;
    }
    
    setIsSubmitting(true);
    const { error } = await signIn(email, password);
    setIsSubmitting(false);
    
    if (error) {
      toast({
        title: "خطأ في تسجيل الدخول",
        description: error.message || "البريد الإلكتروني أو كلمة المرور غير صحيحة",
        variant: "destructive",
      });
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast({
        title: "خطأ",
        description: "يرجى إدخال البريد الإلكتروني وكلمة المرور",
        variant: "destructive",
      });
      return;
    }

    if (password.length < 6) {
      toast({
        title: "خطأ",
        description: "كلمة المرور يجب أن تكون 6 أحرف على الأقل",
        variant: "destructive",
      });
      return;
    }
    
    setIsSubmitting(true);
    const { error } = await signUp(email, password, username || undefined);
    setIsSubmitting(false);
    
    if (error) {
      let message = error.message;
      if (error.message.includes("already registered")) {
        message = "هذا البريد الإلكتروني مسجل مسبقاً";
      }
      toast({
        title: "خطأ في إنشاء الحساب",
        description: message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "تم إنشاء الحساب بنجاح",
        description: "يمكنك الآن تسجيل الدخول",
      });
      setActiveTab("login");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      {/* Decorative Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 -left-20 w-60 h-60 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 right-1/3 w-72 h-72 bg-primary/10 rounded-full blur-3xl" />
      </div>

      <div className="relative min-h-screen flex">
        {/* Left Panel - Login Form */}
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-md space-y-8">
            {/* Logo & Brand */}
            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-primary/80 shadow-xl shadow-primary/25">
                <Ship className="w-10 h-10 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-4xl font-bold tracking-tight">Tracker</h1>
                <p className="text-muted-foreground mt-2">نظام إدارة الشحنات والتكاليف</p>
              </div>
            </div>

            {/* Auth Card */}
            <Card className="border-0 shadow-2xl shadow-black/5 bg-card/80 backdrop-blur-sm">
              <CardContent className="p-8">
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "login" | "signup")}>
                  <TabsList className="grid w-full grid-cols-2 mb-6">
                    <TabsTrigger value="login">تسجيل الدخول</TabsTrigger>
                    <TabsTrigger value="signup">حساب جديد</TabsTrigger>
                  </TabsList>

                  <TabsContent value="login">
                    <form onSubmit={handleLogin} className="space-y-5">
                      <div className="space-y-2">
                        <Label htmlFor="email" className="text-sm font-medium">
                          البريد الإلكتروني
                        </Label>
                        <div className="relative">
                          <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                          <Input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="أدخل البريد الإلكتروني"
                            className="pr-11 h-12 text-base"
                            dir="ltr"
                            disabled={isSubmitting}
                            data-testid="input-email"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="password" className="text-sm font-medium">
                          كلمة المرور
                        </Label>
                        <div className="relative">
                          <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                          <Input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="أدخل كلمة المرور"
                            className="pr-11 h-12 text-base"
                            dir="ltr"
                            disabled={isSubmitting}
                            data-testid="input-password"
                          />
                        </div>
                      </div>

                      <Button
                        type="submit"
                        className="w-full h-12 text-base font-medium"
                        disabled={isSubmitting}
                        data-testid="button-login"
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="ml-2 h-5 w-5 animate-spin" />
                            جاري تسجيل الدخول...
                          </>
                        ) : (
                          <>
                            تسجيل الدخول
                            <ArrowLeft className="mr-2 h-5 w-5" />
                          </>
                        )}
                      </Button>
                    </form>
                  </TabsContent>

                  <TabsContent value="signup">
                    <form onSubmit={handleSignUp} className="space-y-5">
                      <div className="space-y-2">
                        <Label htmlFor="signup-username" className="text-sm font-medium">
                          اسم المستخدم (اختياري)
                        </Label>
                        <div className="relative">
                          <User className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                          <Input
                            id="signup-username"
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="أدخل اسم المستخدم"
                            className="pr-11 h-12 text-base"
                            dir="ltr"
                            disabled={isSubmitting}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="signup-email" className="text-sm font-medium">
                          البريد الإلكتروني
                        </Label>
                        <div className="relative">
                          <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                          <Input
                            id="signup-email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="أدخل البريد الإلكتروني"
                            className="pr-11 h-12 text-base"
                            dir="ltr"
                            disabled={isSubmitting}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="signup-password" className="text-sm font-medium">
                          كلمة المرور
                        </Label>
                        <div className="relative">
                          <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                          <Input
                            id="signup-password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="أدخل كلمة المرور (6 أحرف على الأقل)"
                            className="pr-11 h-12 text-base"
                            dir="ltr"
                            disabled={isSubmitting}
                          />
                        </div>
                      </div>

                      <Button
                        type="submit"
                        className="w-full h-12 text-base font-medium"
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="ml-2 h-5 w-5 animate-spin" />
                            جاري إنشاء الحساب...
                          </>
                        ) : (
                          <>
                            إنشاء حساب
                            <UserPlus className="mr-2 h-5 w-5" />
                          </>
                        )}
                      </Button>
                    </form>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            {/* Footer */}
            <p className="text-center text-sm text-muted-foreground">
              © {new Date().getFullYear()} Tracker - جميع الحقوق محفوظة
            </p>
          </div>
        </div>

        {/* Right Panel - Features */}
        <div className="hidden lg:flex flex-1 items-center justify-center p-12 bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5">
          <div className="max-w-lg space-y-10">
            {/* Hero Text */}
            <div className="space-y-4">
              <h2 className="text-3xl font-bold leading-tight">
                إدارة شحناتك بكل سهولة واحترافية
              </h2>
              <p className="text-lg text-muted-foreground leading-relaxed">
                تتبع شحناتك من لحظة الشراء حتى الاستلام، مع حساب دقيق للتكاليف 
                بالجنيه المصري والرممبي الصيني
              </p>
            </div>

            {/* Features Grid */}
            <div className="grid grid-cols-2 gap-4">
              <FeatureItem
                icon={Ship}
                title="إدارة الشحنات"
                description="تتبع جميع مراحل الشحن"
              />
              <FeatureItem
                icon={BarChart3}
                title="حساب التكاليف"
                description="حساب دقيق بالعملتين"
              />
              <FeatureItem
                icon={CreditCard}
                title="متابعة السداد"
                description="تسجيل المدفوعات"
              />
              <FeatureItem
                icon={Package}
                title="المخزون"
                description="ربط تلقائي بالمخزون"
              />
              <FeatureItem
                icon={Globe}
                title="أسعار الصرف"
                description="إدارة أسعار العملات"
              />
              <FeatureItem
                icon={Shield}
                title="الصلاحيات"
                description="نظام أدوار متكامل"
              />
            </div>

            {/* Currency Pills */}
            <div className="flex flex-wrap gap-3">
              <div className="inline-flex items-center gap-2 bg-background/80 backdrop-blur-sm rounded-full px-4 py-2 border shadow-sm">
                <span className="text-xl font-bold text-primary">¥</span>
                <span className="text-sm font-medium">رممبي صيني</span>
              </div>
              <div className="inline-flex items-center gap-2 bg-background/80 backdrop-blur-sm rounded-full px-4 py-2 border shadow-sm">
                <span className="text-xl font-bold text-primary">ج.م</span>
                <span className="text-sm font-medium">جنيه مصري</span>
              </div>
              <div className="inline-flex items-center gap-2 bg-background/80 backdrop-blur-sm rounded-full px-4 py-2 border shadow-sm">
                <span className="text-xl font-bold text-primary">$</span>
                <span className="text-sm font-medium">دولار أمريكي</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureItem({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Ship;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 p-4 rounded-xl bg-background/60 backdrop-blur-sm border shadow-sm">
      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
        <Icon className="w-5 h-5 text-primary" />
      </div>
      <div className="min-w-0">
        <h4 className="font-semibold text-sm">{title}</h4>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </div>
  );
}
