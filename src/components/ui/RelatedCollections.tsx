import Link from 'next/link';
import { cn } from '@/lib/utils';

type Collection = {
  title: string;
  href: string;
  description: string;
};

interface RelatedCollectionsProps {
  items: Collection[];
  className?: string;
}

export function RelatedCollections({ items, className }: RelatedCollectionsProps) {
  if (!items || items.length === 0) return null;

  return (
    <section className={cn('mt-16 pt-16 border-t', className)}>
      <div className="flex flex-col gap-2 mb-8">
        <h2 className="text-2xl font-bold tracking-tight">Related Categories</h2>
        <p className="text-muted-foreground">
          Explore more products in these related categories to find exactly what you need.
        </p>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group block p-6 border rounded-2xl hover:border-primary/50 hover:bg-primary/[0.02] transition-all duration-300"
          >
            <h3 className="font-semibold text-lg group-hover:text-primary transition-colors">
              {item.title}
            </h3>
            <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
              {item.description}
            </p>
            <div className="mt-4 flex items-center text-xs font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
              Shop Now
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="ml-1"
              >
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
