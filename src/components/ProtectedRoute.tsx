import { ReactNode, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRole?: "admin" | "faculty";
}

const ProtectedRoute = ({ children, requiredRole }: ProtectedRouteProps) => {
  const navigate = useNavigate();
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    const checkAccess = async () => {
      // Check if user is authenticated
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        navigate("/login");
        return;
      }

      // If no specific role is required, allow access
      if (!requiredRole) {
        setIsAuthorized(true);
        return;
      }

      // Fetch user's role
      const { data: roleData, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .single();

      if (error || !roleData) {
        console.error("Failed to fetch user role:", error);
        navigate("/login");
        return;
      }

      // Check if user has required role
      if (roleData.role === requiredRole || requiredRole === "faculty") {
        // Faculty can access faculty routes, both can access their own routes
        setIsAuthorized(true);
      } else {
        // User doesn't have required role
        navigate(roleData.role === "faculty" ? "/faculty-dashboard" : "/dashboard");
        setIsAuthorized(false);
      }
    };

    checkAccess();
  }, [navigate, requiredRole]);

  // Show loading state while checking authorization
  if (isAuthorized === null) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Only render children if authorized
  if (!isAuthorized) {
    return null;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
