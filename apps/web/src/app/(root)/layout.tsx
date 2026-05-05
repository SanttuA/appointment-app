import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Healthcare appointments",
  description: "Accessible appointment booking for healthcare workers and patients.",
};

export default function RootRedirectLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{props.children}</body>
    </html>
  );
}
