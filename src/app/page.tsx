import { redirect } from "next/navigation";

// The human control surface lands on Project Home.
export default function Home() {
  redirect("/projects");
}
