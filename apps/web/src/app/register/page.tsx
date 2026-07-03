import { redirect } from 'next/navigation';
import { RegistrationForm } from '@/features/auth';
import { PersonalRegisterForm } from '@/features/auth/components/personal-register-form';

const TENANCY_MODE =
  process.env.NEXT_PUBLIC_TENANCY_MODE || (process.env.NEXT_PUBLIC_MULTI_TENANT === 'false' ? 'single' : 'multi');

// Placeholder marketing stats — replace with your product's real value props
// before launch. These render in the left column of the registration page.
const valueProps = [
  { number: 'XX%', description: 'your headline metric here' },
  { number: 'X,XXX', description: 'your usage or scale stat here' },
  { number: 'XX hrs', description: 'time saved — quantify your core benefit' },
  { number: '1 click', description: 'your simplest "aha" moment here' },
  { number: '24/7', description: 'your reliability or support promise here' },
];

export default function RegisterPage() {
  // Tenancy modes: 'multi' = full org registration wizard; 'personal' =
  // simple signup (a workspace per user); 'single' = users are provisioned
  // by an admin, so send visitors to login.
  if (TENANCY_MODE === 'single') {
    redirect('/login');
  }
  if (TENANCY_MODE === 'personal') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <PersonalRegisterForm />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left column — value props (desktop only) */}
      <div className="hidden md:flex md:w-[45%] lg:w-[40%] bg-foreground text-background flex-col justify-center p-10 lg:p-14">
        <div className="space-y-10">
          {valueProps.map((prop) => (
            <div key={prop.number}>
              <p className="text-4xl lg:text-5xl font-bold tracking-tight">{prop.number}</p>
              <p className="text-sm lg:text-base opacity-70 mt-1">{prop.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Right column — registration form */}
      <div className="flex-1 flex items-center justify-center p-4 md:p-8">
        <RegistrationForm />
      </div>
    </div>
  );
}
