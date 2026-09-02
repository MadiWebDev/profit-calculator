'use client';

import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useStoreSettings } from '@/hooks/use-store-settings';

interface WhatsAppOrderButtonProps {
  productTitle?: string;
  productPrice?: string;
  productUrl?: string;
  quantity?: number;
  cartItems?: Array<{
    title: string;
    price: number;
    quantity: number;
    currencyCode: string;
  }>;
  className?: string;
  variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'link' | 'destructive';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  children?: React.ReactNode;
}

export function WhatsAppOrderButton({
  productTitle,
  productPrice,
  productUrl,
  quantity = 1,
  cartItems,
  className,
  variant = 'default',
  size = 'default',
  children,
}: WhatsAppOrderButtonProps) {
  const { settings } = useStoreSettings();
  const phoneNumber = (settings.socialMedia?.whatsapp || process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '923394424149').replace(/\D/g, '');

  const formatCurrency = (amount: number, _currencyCode: string = 'PKR') => {
    return new Intl.NumberFormat('en-US', {
      style: 'decimal',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const handleWhatsAppOrder = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    let message = '';

    if (cartItems && cartItems.length > 0) {
      // Cart order message
      const totalAmount = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);
      
      message = `Hello! I would like to order the following items from my cart:

${cartItems.map((item, index) => 
  `${index + 1}. *${item.title}*
   Price: ${formatCurrency(item.price, item.currencyCode)}
   Quantity: ${item.quantity}
   Subtotal: ${formatCurrency(item.price * item.quantity, item.currencyCode)}`
).join('\n\n')}

*Order Summary:*
Total Items: ${totalItems}
Total Amount: ${formatCurrency(totalAmount, cartItems[0]?.currencyCode || 'PKR')}

Please confirm availability and provide payment details.`;
    } else if (productTitle) {
      // Single product order message
      const currentUrl = productUrl || (typeof window !== 'undefined' ? window.location.href : '');
      message = `Hello! I'm interested in ordering:

*Product:* ${productTitle}
*Price:* ${productPrice || 'Please provide price'}
*Quantity:* ${quantity}
*Product Link:* ${currentUrl}

Please confirm availability and provide payment details.`;
    } else {
      // Generic message
      message = `Hello! I'm interested in placing an order. Please provide more details about your products and pricing.`;
    }

    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  return (
    <Button
      onClick={handleWhatsAppOrder}
      variant={variant}
      size={size}
      className={cn(
        'gap-2 bg-green-600 hover:bg-green-700 cursor-pointer',
        variant === 'outline' && 'border-green-600 text-green-600 hover:bg-green-600 text-white',
        className
      )}
    >
      <MessageCircle className="h-4 w-4" />
      {children || 'Order via WhatsApp'}
    </Button>
  );
}