import DashboardThemeProvider from "@/components/DashboardThemeProvider";
import DashboardSidebar from "@/components/DashboardSidebar";
import DashboardNavbar from "@/components/DashboardNavbar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardThemeProvider>
      <div className="min-h-screen flex">
        <DashboardSidebar />
        <div className="flex-1 pl-14">
          <DashboardNavbar />
          {children}
        </div>
      </div>
    </DashboardThemeProvider>
  );
}
