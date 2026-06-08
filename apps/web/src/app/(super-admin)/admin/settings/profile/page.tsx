'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@sally/ui/components/ui/card';
import { Button } from '@sally/ui/components/ui/button';
import { Label } from '@sally/ui/components/ui/label';
import { Separator } from '@sally/ui/components/ui/separator';
import { Avatar, AvatarFallback } from '@sally/ui/components/ui/avatar';
import { Badge } from '@sally/ui/components/ui/badge';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { useAuth } from '@/features/auth';
import { showSuccess } from '@sally/ui';

export default function SuperAdminProfilePage() {
  const { user } = useAuth();

  const handleChangePassword = () => {
    // TODO: Implement Firebase password change redirect
    showSuccess('Password change via Firebase is not yet implemented.');
  };

  const getInitials = () => {
    if (!user) return 'U';
    return `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase();
  };

  if (!user) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-4 w-56 mt-1" />
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <Skeleton className="h-16 w-16 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-5 w-24" />
            </div>
          </div>
          <Separator />
          <div className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-10 w-36" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>Your account information</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Profile Info */}
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarFallback className="bg-black dark:bg-white text-white dark:text-black text-lg">
              {getInitials()}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium text-lg">
              {user.firstName} {user.lastName}
            </p>
            <p className="text-sm text-muted-foreground">{user.email}</p>
            <Badge variant="default" className="mt-1">
              Super Admin
            </Badge>
          </div>
        </div>

        <Separator />

        {/* Password Section */}
        <div>
          <Label className="text-base">Password</Label>
          <p className="text-sm text-muted-foreground mb-2">Manage your password through Firebase Authentication</p>
          <Button variant="outline" onClick={handleChangePassword}>
            Change Password
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
