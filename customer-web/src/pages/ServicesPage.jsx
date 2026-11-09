import Header from "../components/layout/Header.jsx";
import Footer from "../components/layout/Footer.jsx";
import ServicesHero from "../components/services/ServicesHero.jsx";
import ServiceBenefits from "../components/services/ServiceBenefits.jsx";
import ServiceCatalog from "../components/services/ServiceCatalog.jsx";
import ServicePricing from "../components/services/ServicePricing.jsx";
import ServiceProcess from "../components/services/ServiceProcess.jsx";
import ServiceTools from "../components/services/ServiceTools.jsx";
import ServiceTrust from "../components/services/ServiceTrust.jsx";
import ServiceArticles from "../components/services/ServiceArticles.jsx";
import ServiceCTA from "../components/services/ServiceCTA.jsx";

export default function ServicesPage() {
  return (
    <>
      <Header />
      <main>
        <ServicesHero />
        <ServiceBenefits />
        <ServiceCatalog />
        <ServicePricing />
        <ServiceProcess />
        <ServiceTools />
        <ServiceTrust />
        <ServiceArticles />
        <ServiceCTA />
      </main>
      <Footer />
    </>
  );
}
