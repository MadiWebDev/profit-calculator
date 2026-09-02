import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav className="flex items-center gap-2 text-sm text-primary -gray-400" aria-label="Breadcrumb">
      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-2">
          {index > 0 && <ChevronRight size={16} className="text-gray-400" />}
          {item.href ? (
            <Link
              href={item.href}
              className="hover:text-pink-600 dark:hover:text-pink-400 transition-colors"
            >
              {item.label}
            </Link>
          ) : (
            <span className=" text-primary -white font-medium">
              {item.label}
            </span>
          )}
        </div>
      ))}
    </nav>
  );
}
