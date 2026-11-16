import Header from "../components/layout/Header.jsx";
import Footer from "../components/layout/Footer.jsx";
import HeroSection from "../components/home/HeroSection.jsx";
import BenefitsBar from "../components/home/BenefitsBar.jsx";
import PlatformsSection from "../components/home/PlatformsSection.jsx";
import ServicesSection from "../components/home/ServicesSection.jsx";
import SolutionsCarousel from "../components/home/SolutionsCarousel.jsx";
import ProcessSection from "../components/home/ProcessSection.jsx";
import TrackingSection from "../components/home/TrackingSection.jsx";
import WhyChooseUs from "../components/home/WhyChooseUs.jsx";
import FAQSection from "../components/home/FAQSection.jsx";
import ServicesPage from "../pages/ServicesPage.jsx";
import PricingPage from "../pages/PricingPage.jsx";
import AboutPage from "../pages/AboutPage.jsx";
import HelpCenterPage from "../pages/HelpCenterPage.jsx";
import GuideDetailPage from "../pages/GuideDetailPage.jsx";
import FloatingSupport from "../components/layout/FloatingSupport.jsx";
import LoginPage from "../pages/LoginPage.jsx";
import RegisterPage from "../pages/RegisterPage.jsx";
import CustomerPortalPage from "../pages/customer/CustomerPortalPage.jsx";
import AuthRecoveryPage from "../pages/AuthRecoveryPage.jsx";

export default function App() {
  const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
  let page;

  if (pathname === "/tai-khoan" || pathname.startsWith("/tai-khoan/")) {
    page = <CustomerPortalPage />;
  } else if (pathname === "/dich-vu") {
    page = <ServicesPage />;
  } else if (pathname === "/bang-gia") {
    page = <PricingPage />;
  } else if (pathname === "/gioi-thieu") {
    page = <AboutPage />;
  } else if (pathname === "/huong-dan") {
    page = <HelpCenterPage />;
  } else if (pathname.startsWith("/huong-dan/")) {
    page = <GuideDetailPage slug={pathname.split("/").pop()} />;
  } else if (pathname === "/dang-nhap") {
    page = <LoginPage />;
  } else if (pathname === "/dang-ky") {
    page = <RegisterPage />;
  } else if (pathname === "/quen-mat-khau" || pathname === "/dat-lai-mat-khau") {
    page = <AuthRecoveryPage reset={pathname === "/dat-lai-mat-khau"} />;
  } else {
    page = <><Header /><main><HeroSection /><BenefitsBar /><PlatformsSection /><ServicesSection /><SolutionsCarousel /><ProcessSection /><TrackingSection /><WhyChooseUs /><FAQSection /></main><Footer /></>;
  }

  return <>{page}<FloatingSupport /></>;
}
