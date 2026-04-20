import { redirect } from "next/navigation";

/**
 * Token Economics moved to the Management role view as part of the
 * UI redesign so the Teacher dashboard stays focused on pedagogy.
 * Anyone landing on the old URL is forwarded to the new home.
 */
export default function TokenEconomicsRedirect() {
  redirect("/management/economics");
}
