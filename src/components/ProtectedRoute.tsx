import { ReactNode, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRole?: "admin" | "faculty";
  authOnly?: boolean;
}

const ProtectedRoute = ({ children, requiredRole, authOnly }: ProtectedRouteProps) => {
  const navigate = useNavigate();
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    const checkAccess = async () => {
      console.log('[ProtectedRoute] checkAccess start', { requiredRole, authOnly });
      // Check if user is authenticated
      const {
        data: { user },
      } = await supabase.auth.getUser();

      console.log('[ProtectedRoute] supabase.auth.getUser ->', { userId: user?.id });

      if (!user) {
        console.log('[ProtectedRoute] no user -> navigating to /login');
        navigate("/login");
        return;
      }

      // If authOnly is true or no specific role is required, allow access after authentication
      if (authOnly || !requiredRole) {
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
        console.error("[ProtectedRoute] Failed to fetch user role:", error, { roleData });
        // Don't aggressively navigate away; treat as unauthorized and stop
        setIsAuthorized(false);
        return;
      }

      console.log('[ProtectedRoute] user roleData ->', roleData);

      // Check if user has required role
      if (roleData.role === requiredRole) {
        setIsAuthorized(true);
      } else {
        // User doesn't have required role; do not navigate automatically (avoid unexpected redirects)
        console.log('[ProtectedRoute] role mismatch - denying access (no redirect)', { userRole: roleData.role });
        setIsAuthorized(false);
        return;
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
