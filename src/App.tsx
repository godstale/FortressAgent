import { Button } from '@/components/ui/button';

export default function App() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <h1 className="text-2xl font-bold">Fortress</h1>
        <Button>Get Started</Button>
      </div>
    </main>
  );
}
