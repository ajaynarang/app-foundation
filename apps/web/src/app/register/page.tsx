import { RegistrationForm } from '@/features/auth';

const valueProps = [
  { number: '$185K+', description: 'saved annually per 50-truck fleet' },
  { number: '520', description: 'dispatcher hours recovered per year' },
  { number: '100%', description: 'HOS compliant. Every route. Every time.' },
  { number: '1 click', description: 'optimized route — stops, fuel, rest, HOS. Done.' },
  { number: '24/7', description: 'continuous monitoring, zero manual checks' },
];

export default function RegisterPage() {
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
