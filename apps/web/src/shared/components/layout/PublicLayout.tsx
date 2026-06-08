'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { Menu, X, LogIn, LogOut, ArrowRight, UserPlus, ExternalLink, Settings } from 'lucide-react';
import { useAuthStore } from '@/features/auth';
import { Button } from '@app/ui/components/ui/button';
import { Avatar, AvatarFallback } from '@app/ui/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@app/ui/components/ui/dropdown-menu';
import { ThemeToggle } from './ThemeToggle';
import { DevSwitcherTrigger } from '@/shared/components/common';
import { getDefaultRouteForRole } from '@/shared/lib/navigation';
import { Footer } from '@/shared/components/footer';

const navItems = [
  { label: 'Home', href: '/', external: false },
  { label: 'Product', href: '/product', external: false },
  { label: 'Pricing', href: '/pricing', external: false },
  { label: 'Docs', href: `${process.env.NEXT_PUBLIC_CONSOLE_URL || 'http://localhost:3002'}/docs`, external: true },
];

interface PublicLayoutProps {
  children: React.ReactNode;
}

/**
 * PublicLayout - Layout for unauthenticated pages (landing, login)
 * Provides minimal header with branding, login button, and theme toggle
 */
export function PublicLayout({ children }: PublicLayoutProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, user, signOut } = useAuthStore();

  const handleLogout = async () => {
    try {
      await signOut();
      router.push('/');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Logout failed:', err);
      router.push('/');
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Public Header */}
      <header className="border-b border-border bg-background sticky top-0 z-50">
        <div className="flex items-center justify-between px-4 md:px-6 py-3">
          {/* Logo and tagline */}
          <div className="flex items-center gap-2">
            <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity" data-sally-logo>
              <Image
                src="/sally-logo-dark.svg"
                alt="SALLY"
                width={28}
                height={28}
                className="h-7 w-7 dark:block hidden"
              />
              <Image
                src="/sally-logo-light.svg"
                alt="SALLY"
                width={28}
                height={28}
                className="h-7 w-7 dark:hidden block"
              />
              <span className="text-lg sm:text-xl font-bold text-foreground font-space-grotesk">SALLY</span>
            </Link>
            <span className="hidden sm:inline text-xs text-gray-400">|</span>
            <p className="hidden sm:block text-xs text-gray-500">Smart Routes. Confident Dispatchers. Happy Drivers.</p>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-2">
            {/* Nav Links */}
            <nav className="flex items-center gap-1 mr-4">
              {navItems.map((item) => {
                const isActive = !item.external && pathname === item.href;
                if (item.external) {
                  return (
                    <a
                      key={item.label}
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-md"
                    >
                      {item.label}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  );
                }
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                      isActive ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <ThemeToggle />

            {/* Login/Register or Profile Menu */}
            {!isAuthenticated ? (
              <>
                <Link href="/register">
                  <Button variant="outline" size="sm">
                    <UserPlus className="h-4 w-4 mr-2" />
                    Register
                  </Button>
                </Link>
                <Link href="/login">
                  <Button size="sm">
                    <LogIn className="h-4 w-4 mr-2" />
                    Login
                  </Button>
                </Link>
              </>
            ) : (
              <div className="flex items-center gap-2">
                {/* Go to App button - always visible */}
                <Link href={getDefaultRouteForRole(user?.role)}>
                  <Button size="sm">
                    Go to App
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </Link>

                {/* Profile dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-2 rounded-full hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600">
                      <Avatar className="h-9 w-9">
                        <AvatarFallback className="bg-black dark:bg-white text-white dark:text-black text-sm">
                          {user ? `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase() : 'U'}
                        </AvatarFallback>
                      </Avatar>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium">{user ? `${user.firstName} ${user.lastName}` : 'User'}</p>
                        <p className="text-xs text-muted-foreground">{user?.email}</p>
                        {user?.tenantName && <p className="text-xs text-muted-foreground">{user.tenantName}</p>}
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => router.push(getDefaultRouteForRole(user?.role))}>
                      <ArrowRight className="mr-2 h-4 w-4" />
                      <span>Go to App</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => router.push('/settings/general')}>
                      <Settings className="mr-2 h-4 w-4" />
                      <span>Settings</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout} className="text-critical">
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Logout</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
            <DevSwitcherTrigger />
          </div>

          {/* Mobile right section */}
          <div className="flex items-center gap-1 md:hidden">
            <DevSwitcherTrigger />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile Navigation Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-t border-border bg-background">
            <div className="flex flex-col p-2 space-y-1">
              {/* Nav links on mobile */}
              <nav className="flex flex-col space-y-1 pb-2 border-b border-border mb-2">
                {navItems.map((item) => {
                  const isActive = !item.external && pathname === item.href;
                  if (item.external) {
                    return (
                      <a
                        key={item.label}
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-md"
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        {item.label}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    );
                  }
                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      className={`px-4 py-2 text-sm rounded-md transition-colors ${
                        isActive
                          ? 'text-foreground font-medium bg-muted'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>

              {/* Theme toggle on mobile */}
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm font-medium text-muted-foreground">Theme</span>
                <ThemeToggle />
              </div>

              {/* Login/Logout on mobile */}
              {!isAuthenticated ? (
                <>
                  <Link href="/register" className="w-full">
                    <Button variant="outline" size="sm" className="w-full" onClick={() => setIsMobileMenuOpen(false)}>
                      <UserPlus className="h-4 w-4 mr-2" />
                      Register
                    </Button>
                  </Link>
                  <Link href="/login" className="w-full">
                    <Button size="sm" className="w-full" onClick={() => setIsMobileMenuOpen(false)}>
                      <LogIn className="h-4 w-4 mr-2" />
                      Login
                    </Button>
                  </Link>
                </>
              ) : (
                <>
                  {/* User info on mobile */}
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-border mb-2">
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className="bg-black dark:bg-white text-white dark:text-black text-sm">
                        {user ? `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase() : 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {user ? `${user.firstName} ${user.lastName}` : 'User'}
                      </p>
                      <p className="text-xs text-muted-foreground">{user?.email}</p>
                    </div>
                  </div>
                  <Link href={getDefaultRouteForRole(user?.role)} className="w-full">
                    <Button size="sm" className="w-full" onClick={() => setIsMobileMenuOpen(false)}>
                      <ArrowRight className="h-4 w-4 mr-2" />
                      Go to App
                    </Button>
                  </Link>
                  <Link href="/settings/general" className="w-full">
                    <Button variant="outline" size="sm" className="w-full" onClick={() => setIsMobileMenuOpen(false)}>
                      <Settings className="h-4 w-4 mr-2" />
                      Settings
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-critical"
                    onClick={() => {
                      handleLogout();
                      setIsMobileMenuOpen(false);
                    }}
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Logout
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Main content */}
      <main className="flex-1">{children}</main>

      <Footer />
    </div>
  );
}

export default PublicLayout;
