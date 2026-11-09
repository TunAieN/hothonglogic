import { useMemo, useState } from "react";
import Header from "../components/layout/Header.jsx";
import Footer from "../components/layout/Footer.jsx";
import { GuideResults, HelpHero, HelpSupportCTA, QuickCategories, ResourcesSection } from "../components/help/HelpCenterSections.jsx";
import { guides } from "../data/helpContent.js";
import { searchGuides } from "../utils/searchGuides.js";

export default function HelpCenterPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const results = useMemo(() => searchGuides(guides, query, category), [query, category]);
  const showResults = () => requestAnimationFrame(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("guide-results")?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  });
  const submit = (event) => { event.preventDefault(); setQuery((value) => value.trim()); showResults(); };
  const useTag = (value) => { setCategory("all"); setQuery(value); showResults(); };
  const selectCategory = (value) => { setQuery(""); setCategory((current) => current === value ? "all" : value); showResults(); };
  const reset = () => { setQuery(""); setCategory("all"); };
  return <><Header/><main><HelpHero query={query} onQueryChange={setQuery} onSubmit={submit} onTag={useTag}/><QuickCategories activeCategory={category} onSelect={selectCategory}/><GuideResults guides={results} query={query} category={category} onReset={reset}/><ResourcesSection/><HelpSupportCTA/></main><Footer/></>;
}
