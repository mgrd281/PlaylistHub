'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, Loader2, Tv } from 'lucide-react';
import { toast } from 'sonner';

export function ActivateForm({ initialCode }: { initialCode: string }) {
  const router = useRouter();
  const [code, setCode] = useState(initialCode);
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleActivate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;

    setIsLoading(true);
    try {
      const res = await fetch('/api/devices/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activation_code: trimmed }),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess(true);
        toast.success('Device activated successfully!');
        setTimeout(() => router.push('/devices'), 2000);
      } else {
        toast.error(data.error || 'Activation failed');
      }
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  if (success) {
    return (
      <Card className="mx-auto max-w-md">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <CheckCircle className="h-16 w-16 text-green-500" />
          <h3 className="mt-4 text-xl font-semibold">Device Activated!</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Redirecting to your devices...
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <Tv className="h-8 w-8" />
        </div>
        <CardTitle>Link Your Device</CardTitle>
        <CardDescription>
          Enter the 8-character code shown on your TV or device app
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleActivate} className="space-y-4">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="XXXX-XXXX"
            maxLength={9}
            className="text-center text-2xl font-mono tracking-[0.3em] h-14"
            autoFocus
          />
          <Button
            type="submit"
            className="w-full"
            disabled={code.trim().length < 8 || isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Activating...
              </>
            ) : (
              'Activate Device'
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
