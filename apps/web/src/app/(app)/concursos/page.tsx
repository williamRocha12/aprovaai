import type { Metadata } from "next";
import { CatalogList } from "./catalog-list";

export const metadata: Metadata = { title: "Concursos" };

export default function CatalogPage() {
  return <CatalogList />;
}
