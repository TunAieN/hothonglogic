import { useState } from "react";
import Header from "../components/layout/Header.jsx";
import Footer from "../components/layout/Footer.jsx";
import PricingHero from "../components/pricing/PricingHero.jsx";
import CustomerTypeTabs from "../components/pricing/CustomerTypeTabs.jsx";
import PricingOverview from "../components/pricing/PricingOverview.jsx";
import ShippingRatesSection from "../components/pricing/ShippingRatesSection.jsx";
import PriceCalculator from "../components/pricing/PriceCalculator.jsx";
import AdditionalServices from "../components/pricing/AdditionalServices.jsx";
import PricingNotes from "../components/pricing/PricingNotes.jsx";
import PricingCTA from "../components/pricing/PricingCTA.jsx";
import styles from "../components/pricing/PricingPage.module.css";

export default function PricingPage() {
  const [customerType, setCustomerType] = useState("retail");
  const [shippingMode, setShippingMode] = useState("kg");

  return (
    <>
      <Header />
      <main>
        <PricingHero />
        <CustomerTypeTabs value={customerType} onChange={setCustomerType} />
        <PricingOverview customerType={customerType} />
        <section className={`section ${styles.workspace}`}>
          <div className={`container ${styles.workspaceGrid}`}>
            <div>
              <ShippingRatesSection mode={shippingMode} onModeChange={setShippingMode} customerType={customerType} />
              <AdditionalServices />
            </div>
            <PriceCalculator customerType={customerType} shippingMode={shippingMode} onShippingModeChange={setShippingMode} />
          </div>
        </section>
        <PricingNotes />
        <PricingCTA />
      </main>
      <Footer />
    </>
  );
}
