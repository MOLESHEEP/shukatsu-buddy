import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { LoaderCircle } from "lucide-react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export type Tone = "sakura" | "mint" | "sky" | "lemon" | "violet" | "stone" | "rose";

const toneClass: Record<Tone, string> = {
  sakura: "bg-sakura-50 text-sakura-700 ring-sakura-100",
  rose: "bg-sakura-50 text-sakura-700 ring-sakura-100",
  mint: "bg-mint-50 text-mint-700 ring-mint-100",
  sky: "bg-sky-50 text-sky-700 ring-sky-100",
  lemon: "bg-lemon-50 text-lemon-700 ring-lemon-100",
  violet: "bg-violet-50 text-violet-700 ring-violet-100",
  stone: "bg-stone-50 text-stone-700 ring-stone-100",
};

export const toneDot: Record<Tone, string> = {
  sakura: "bg-sakura-500",
  rose: "bg-sakura-500",
  mint: "bg-mint-500",
  sky: "bg-sky-500",
  lemon: "bg-lemon-500",
  violet: "bg-violet-500",
  stone: "bg-stone-500",
};

export function Badge({ tone = "stone", children, className }: { tone?: Tone | string; children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", toneClass[tone as Tone] ?? toneClass.stone, className)}>
      {children}
    </span>
  );
}

export function Card({ children, className, ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("rounded-[var(--radius-card)] border border-line bg-paper p-5 shadow-[var(--shadow-soft)]", className)} {...rest}>
      {children}
    </div>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "soft" | "ghost" | "danger"; loading?: boolean; size?: "sm" | "md" };

export function Button({ variant = "primary", loading, size = "md", className, children, disabled, ...rest }: ButtonProps) {
  const styles = {
    primary: "bg-sakura-500 text-white hover:bg-sakura-600 shadow-[var(--shadow-lift)]",
    soft: "bg-sakura-50 text-sakura-700 hover:bg-sakura-100",
    ghost: "text-muted hover:bg-stone-50 hover:text-ink",
    danger: "bg-paper text-sakura-700 ring-1 ring-sakura-100 hover:bg-sakura-50",
  }[variant];
  return (
    <button
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-full font-medium transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "px-3 py-1.5 text-sm" : "px-5 py-2.5 text-sm",
        styles,
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <LoaderCircle className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

const fieldBase =
  "w-full rounded-xl border border-line bg-paper px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/60 transition focus:border-sakura-300 focus:outline-none focus:ring-4 focus:ring-sakura-50";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(fieldBase, props.className)} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(fieldBase, "leading-relaxed", props.className)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(fieldBase, "appearance-auto pr-8", props.className)} />;
}

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block space-y-1.5", className)}>
      <span className="flex items-baseline justify-between gap-2 text-sm font-medium text-ink">
        {label}
        {hint && <span className="text-xs font-normal text-muted">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export function PageHeader({ title, subtitle, action, emoji }: { title: string; subtitle?: string; action?: ReactNode; emoji?: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {emoji && <span className="mr-2">{emoji}</span>}
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-dashed border-line bg-paper/60 px-6 py-10 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorNote({ message }: { message?: string | null }) {
  if (!message) return null;
  return <p className="rounded-xl bg-sakura-50 px-3.5 py-2.5 text-sm text-sakura-700">{message}</p>;
}
