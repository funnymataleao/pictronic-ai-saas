"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { SparklesCore } from "@/components/ui/sparkles";
import { AuthButtons } from "@/components/auth/auth-buttons";
import {
  MobileNav,
  MobileNavHeader,
  MobileNavMenu,
  MobileNavToggle,
  NavBody,
  NavItems,
  Navbar,
} from "@/components/ui/resizable-navbar";
import { useState } from "react";

const featureCards = [
  {
    title: "AI generation without manual busywork",
    body: "Batch runs launch from one controlled flow: prompt, model, status guardrails, and predictable output quality."
  },
  {
    title: "Higher creator throughput",
    body: "The pipeline is optimized for speed: curate winning frames, edit metadata quickly, and prepare submissions in sequence."
  },
  {
    title: "Adobe Stock integration",
    body: "Approved assets move into a guarded upload queue with transparent stage tracking and runtime safety checks."
  }
];

const workflow = [
  "Shape a commercial prompt profile and batch preset.",
  "Review the masonry feed, refine metadata, and approve only keeper assets.",
  "Ship approved assets through Adobe upload queue with runtime guardrails."
];

const pricingPlans = [
  {
    name: "Studio Start",
    price: "$39",
    note: "For solo creators validating their workflow",
    details: "Up to 3 active projects, baseline generation queue, and manual metadata review."
  },
  {
    name: "Studio Pro",
    price: "$99",
    note: "Best for daily production throughput",
    details: "Expanded batch capacity, priority queueing, and faster preparation for Adobe Stock delivery."
  },
  {
    name: "Studio Scale",
    price: "$249",
    note: "For teams and high-volume publishing",
    details: "Multi-operator access, higher limits, and stability controls for long-running upload sessions."
  }
];

const faqItems = [
  {
    question: "How are connection tokens protected?",
    answer: "Tokens use limited lifetime, rotation, and runtime status checks. Risky actions are blocked automatically when the environment degrades."
  },
  {
    question: "Which models are supported for generation?",
    answer: "The pipeline is built for a local bridge connector and managed model presets. Available models depend on active runtime configuration."
  },
  {
    question: "What happens if an upload fails?",
    answer: "The system records queue stages, surfaces the failure reason, and preserves a controlled retry path without manual session recovery."
  }
];

const footerLinks = [
  { label: "Documentation", href: "#documentation" },
  { label: "Terms of use", href: "#terms" },
  { label: "Guardrails", href: "#proof" }
];

export function PublicLanding() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const navItems = [
    { name: "Features", link: "#features" },
    { name: "Workflow", link: "#workflow" },
    { name: "Pricing", link: "#pricing" },
    { name: "FAQ", link: "#faq" },
    { name: "Guardrails", link: "#proof" }
  ];

  async function onLogin() {
    try {
      await fetch("/api/auth/login", { method: "POST" });
      window.location.assign("/");
    } catch {
      window.location.assign("/");
    }
  }

  return (
    <main className="landing-noir">
      <div className="landing-noir-grid" aria-hidden />
      <Navbar className="landing-navbar-shell" disableScrollTransform>
        <NavBody className="landing-nav-body">
          <a className="landing-brand" href="/" aria-label="Pictronic">
            Pictronic
          </a>
          <NavItems items={navItems} className="landing-nav-items" />
          <div className="landing-header-actions">
            <AuthButtons />
          </div>
        </NavBody>

        <MobileNav className="landing-mobile-nav">
          <MobileNavHeader>
            <a className="landing-brand" href="/" aria-label="Pictronic">
              Pictronic
            </a>
            <MobileNavToggle
              isOpen={isMobileMenuOpen}
              onClick={() => setIsMobileMenuOpen((open) => !open)}
            />
          </MobileNavHeader>

          <MobileNavMenu
            isOpen={isMobileMenuOpen}
            onClose={() => setIsMobileMenuOpen(false)}
            className="landing-mobile-menu"
          >
            {navItems.map((item) => (
              <a
                key={item.link}
                href={item.link}
                onClick={() => setIsMobileMenuOpen(false)}
                className="landing-mobile-menu-link"
              >
                {item.name}
              </a>
            ))}
            <AuthButtons />
          </MobileNavMenu>
        </MobileNav>
      </Navbar>

      <section className="landing-hero-sparkles" aria-label="Hero">
        <div className="landing-hero-sparkles-stage">
          <motion.h1
            className="landing-hero-sparkles-title"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            PICTRONIC
          </motion.h1>
          <motion.p
            className="landing-subtitle"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: "easeOut", delay: 0.14 }}
          >
            Turn every prompt into revenue-ready stock assets and publish at production speed through one controlled workflow.
          </motion.p>
          <motion.div
            className="landing-hero-cta-row"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut", delay: 0.2 }}
          >
            <Button onClick={() => void onLogin()} className="landing-login-btn landing-hero-cta-primary">
              Start in Workspace
            </Button>
            <a className="landing-hero-cta-secondary" href="#proof">
              View runtime guardrails
            </a>
          </motion.div>
          <motion.div
            className="landing-hero-sparkles-beam-wrap"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: "easeOut", delay: 0.08 }}
          >
            <div className="landing-hero-gradient-line landing-hero-gradient-line--wide-blur" aria-hidden />
            <div className="landing-hero-gradient-line landing-hero-gradient-line--wide" aria-hidden />
            <div className="landing-hero-gradient-line landing-hero-gradient-line--core-blur" aria-hidden />
            <div className="landing-hero-gradient-line landing-hero-gradient-line--core" aria-hidden />
            <SparklesCore
              background="transparent"
              minSize={0.4}
              maxSize={1}
              particleDensity={1200}
              className="h-full w-full"
              particleColor="#FFFFFF"
            />
            <div className="landing-hero-sparkles-mask" aria-hidden />
          </motion.div>
        </div>
      </section>

      <section id="features" className="container landing-section landing-value landing-tier-aa" aria-label="Features">
        {featureCards.map((item, index) => (
          <motion.article
            key={item.title}
            className="landing-value-card"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.28 }}
            transition={{ duration: 0.4, delay: index * 0.08 }}
          >
            <p className="landing-chip" style={{ display: "inline-flex", marginBottom: "0.7rem" }}>
              Feature {String(index + 1).padStart(2, "0")}
            </p>
            <h2>{item.title}</h2>
            <p>{item.body}</p>
          </motion.article>
        ))}
      </section>

      <section id="proof" className="container landing-section landing-proof landing-tier-aa" aria-label="Proof">
        <motion.article
          className="landing-proof-card"
          initial={{ opacity: 0, scale: 0.98 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.38 }}
        >
          <p className="landing-proof-kicker">Runtime confidence</p>
          <p className="landing-proof-value">Online with guarded actions and deterministic recovery paths.</p>
          <p className="landing-proof-note">
            Authentication wall stays strict: guest users can see this landing only. Feed and prompts stay private.
          </p>
        </motion.article>
      </section>

      <section id="workflow" className="container landing-section landing-workflow landing-tier-ab" aria-label="Workflow">
        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.35 }}
        >
          Focused workflow for operators
        </motion.h2>
        <div className="landing-workflow-list">
          {workflow.map((step, index) => (
            <motion.div
              key={step}
              className="landing-workflow-step"
              initial={{ opacity: 0, x: -18 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, amount: 0.32 }}
              transition={{ duration: 0.35, delay: index * 0.08 }}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <p>{step}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <section id="pricing" className="container landing-section landing-pricing landing-tier-bc" aria-label="Pricing">
        {pricingPlans.map((plan, index) => (
          <motion.article
            key={plan.name}
            className="landing-pricing-card"
            initial={{ opacity: 0, y: 22 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.35, delay: index * 0.08 }}
          >
            <p className="landing-proof-kicker">{plan.name}</p>
            <p className="landing-pricing-price">{plan.price}</p>
            <p className="landing-pricing-note">{plan.note}</p>
            <p className="landing-pricing-details">{plan.details}</p>
          </motion.article>
        ))}
      </section>

      <section id="faq" className="container landing-section landing-faq landing-tier-aa" aria-label="FAQ">
        {faqItems.map((item, index) => (
          <motion.article
            key={item.question}
            className="landing-faq-item"
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.28 }}
            transition={{ duration: 0.34, delay: index * 0.06 }}
          >
            <h3>{item.question}</h3>
            <p>{item.answer}</p>
          </motion.article>
        ))}
      </section>

      <section id="documentation" className="container landing-section landing-docs landing-tier-cd" aria-label="Documentation">
        <p className="landing-proof-kicker">Documentation</p>
        <p className="landing-docs-text">
          Runtime contracts, guardrails, and integration runbooks are available inside the authenticated workspace.
        </p>
      </section>

      <section id="terms" className="container landing-section landing-terms landing-tier-aa" aria-label="Terms">
        <p className="landing-proof-kicker">Terms of use</p>
        <p className="landing-docs-text">
          By using this platform, operators agree to content licensing limits, secure token handling, and publication
          rules for external stock marketplaces.
        </p>
      </section>

      <footer className="container landing-section landing-footer" aria-label="Footer">
        <p>© {new Date().getFullYear()} Pictronic Studio</p>
        <nav className="landing-footer-links" aria-label="Footer links">
          {footerLinks.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>
      </footer>
    </main>
  );
}
