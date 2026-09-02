import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AuthErrorPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-muted)] px-4">
      <div className="max-w-md w-full text-center">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-red-100 dark:bg-red-950 mb-5">
          <AlertCircle className="h-7 w-7 text-red-600 dark:text-red-400" />
        </div>
        <h1 className="text-2xl font-bold text-[var(--color-foreground)] mb-2">Authentication Error</h1>
        <p className="text-[var(--color-muted-foreground)] mb-8">
          Something went wrong while signing you in. This can happen if your session expired or you used an invalid link.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild>
            <Link href="/auth/login">Try Again</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/">Go Home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
