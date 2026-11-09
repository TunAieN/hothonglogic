import Header from "../components/layout/Header.jsx";
import Footer from "../components/layout/Footer.jsx";
import {
  AboutCTA, AboutHero, BrandStory, CapabilitiesSection,
  CommitmentsSection, TeamSection, WarehouseSection,
} from "../components/about/AboutSections.jsx";

export default function AboutPage() {
  return <><Header /><main><AboutHero /><BrandStory /><CapabilitiesSection /><WarehouseSection /><TeamSection /><CommitmentsSection /><AboutCTA /></main><Footer /></>;
}
