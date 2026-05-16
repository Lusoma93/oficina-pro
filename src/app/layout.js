import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata = {
  title: "SGIN - Gestión de Ingeniería y Notariado",
  description: "Plataforma integral para el control de proyectos y contabilidad en oficinas técnicas y legales.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es" className={`${inter.variable}`}>
      <body className="animate-fade">
        {children}
      </body>
    </html>
  );
}
