import Hero from "@/components/sections/hero";
import Problem from "@/components/sections/problem";
import Solution from "@/components/sections/solution";
import Dimensions from "@/components/sections/dimensions";
import DigitalUniverse from "@/components/sections/digital-universe";
import UniversalAgent from "@/components/sections/universal-agent";
import KnowledgeGraphSection from "@/components/sections/knowledge-graph-section";
import Privacy from "@/components/sections/privacy";
import FinalCTA from "@/components/sections/final-cta";
import Footer from "@/components/sections/footer";

export default function Home() {
  return (
    <main>
      <Hero />
      <Problem />
      <Solution />
      <Dimensions />
      <DigitalUniverse />
      <UniversalAgent />
      <KnowledgeGraphSection />
      <Privacy />
      <FinalCTA />
      <Footer />
    </main>
  );
}
