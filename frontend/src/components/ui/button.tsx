"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffb300] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "bg-[#ffb300] text-[#0f0f0f] hover:bg-[#e6a200] font-semibold",
        secondary:
          "bg-[#0f0f0f] text-white hover:bg-[#1f1f1f] font-semibold",
        outline:
          "border border-[#e5e7eb] bg-white text-[#0f0f0f] hover:bg-[#f9fafb]",
        ghost: "text-[#6b7280] hover:text-[#0f0f0f] hover:bg-[#f3f4f6]",
        subtle: "bg-[#f3f4f6] text-[#0f0f0f] hover:bg-[#e5e7eb]",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-6 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  ),
);
Button.displayName = "Button";

export { buttonVariants };
