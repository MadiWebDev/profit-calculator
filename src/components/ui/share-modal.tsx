'use client';

import { useState } from 'react';
import { Copy, Check, Mail, Link2, MessageCircle } from 'lucide-react';

// Facebook and Twitter were removed from lucide-react v1 — inline SVGs instead
const FacebookIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
  </svg>
);
const TwitterIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M4 4l16 16M4 20L20 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"/>
    <path d="M2 3h6.5l13 18H15L2 3z" />
  </svg>
);
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  url: string;
}

const shareOptions = [
  { name: 'Facebook', icon: FacebookIcon, color: 'bg-blue-600 hover:bg-blue-700', getUrl: (url: string, _title: string) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` },
  { name: 'Twitter', icon: TwitterIcon, color: 'bg-sky-500 hover:bg-sky-600', getUrl: (url: string, title: string) => `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}` },
  { name: 'WhatsApp', icon: MessageCircle, color: 'bg-green-500 hover:bg-green-600', getUrl: (url: string, title: string) => `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}` },
  { name: 'Email', icon: Mail, color: 'bg-gray-600 hover:bg-gray-700', getUrl: (url: string, title: string) => `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(url)}` },
];

export function ShareModal({ isOpen, onClose, title = 'Check this out!', url }: ShareModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleShare = (getUrl: (url: string, title: string) => string) => {
    window.open(getUrl(url, title), '_blank', 'width=600,height=400');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Social Share Buttons */}
          <div className="grid grid-cols-4 gap-3">
            {shareOptions.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.name}
                  onClick={() => handleShare(option.getUrl)}
                  className={cn(
                    "flex flex-col items-center gap-2 p-3 rounded-lg text-white transition-colors",
                    option.color
                  )}
                >
                  <Icon size={20} />
                  <span className="text-xs">{option.name}</span>
                </button>
              );
            })}
          </div>

          {/* Copy Link */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
              <Input
                value={url}
                readOnly
                className="pl-9 pr-4 bg-muted"
              />
            </div>
            <Button onClick={handleCopy} variant="outline" className="gap-2">
              {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
              {copied ? 'Copied!' : 'Copy'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
