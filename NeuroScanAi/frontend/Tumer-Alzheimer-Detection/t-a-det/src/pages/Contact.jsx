import React, { useState } from "react";

/**
 * >>> Fill these with your real details <<<
 */
const CONTACT_INFO = {
  orgName: "NeuroScan AI",
  address: {
    line1: "",
    line2: "",
    city: "Lahore",
    country: "Pakistan"
  },
  emails: ["support@neuroscan.ai"],
  phones: ["+92 3334773180"],
  Address: "Research Lab, Lahore, Pakistan",
};

const Contact = () => {
  const [form, setForm] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });
  const [status, setStatus] = useState({ sending: false, ok: null, msg: "" });

  function onChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!form.name || !form.email || !form.message) {
      setStatus({
        sending: false,
        ok: false,
        msg: "Please fill required fields.",
      });
      return;
    }
    setStatus({ sending: true, ok: null, msg: "" });

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to send");
      setStatus({
        sending: false,
        ok: true,
        msg: "Thanks! Your message has been sent.",
      });
      setForm({ name: "", email: "", subject: "", message: "" });
    } catch (err) {
      setStatus({
        sending: false,
        ok: false,
        msg: err.message || "Something went wrong.",
      });
    }
  }

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-semibold text-slate-800">
          Contact Us
        </h1>
        <p className="text-slate-600 mt-2">
          Have a question or feedback? Send us a message and we’ll get back to
          you.
        </p>
      </div>

      {/* 2-column layout: left = details, right = form */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT: Contact Details */}
        <aside className="lg:col-span-1">
          <div className="h-full rounded-2xl border bg-white p-6">
            <h2 className="text-lg font-semibold text-slate-800">
              {CONTACT_INFO.orgName}
            </h2>

            {/* Address */}
            <div className="mt-5 flex items-start gap-3">
              {/* Map Pin Icon */}
              <svg
                className="w-6 h-6 shrink-0 text-blue-600"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M12 22s7-5.33 7-12a7 7 0 10-14 0c0 6.67 7 12 7 12z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <circle cx="12" cy="10" r="2.5" fill="currentColor" />
              </svg>
              <div className="text-sm">
                <div className="text-slate-700">
                  {CONTACT_INFO.address.line1}
                </div>
                {CONTACT_INFO.address.line2 && (
                  <div className="text-slate-700">
                    {CONTACT_INFO.address.line2}
                  </div>
                )}
                <div className="text-slate-700">
                  {CONTACT_INFO.address.city}, {CONTACT_INFO.address.country}
                </div>
                {CONTACT_INFO.address.mapUrl && (
                  <a
                    href={CONTACT_INFO.address.mapUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block mt-1 text-blue-600 hover:underline"
                  >
                    View on Google Maps
                  </a>
                )}
              </div>
            </div>

            {/* Email */}
            <div className="mt-5 flex items-start gap-3">
              {/* Mail Icon */}
              <svg
                className="w-6 h-6 shrink-0 text-blue-600"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M3 7a2 2 0 012-2h14a2 2 0 012 2v.4l-9 5.4-9-5.4V7z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <path
                  d="M21 9.3V17a2 2 0 01-2 2H5a2 2 0 01-2-2V9.3l9 5.4 9-5.4z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
              </svg>
              <div className="text-sm space-y-1">
                {CONTACT_INFO.emails.map((em) => (
                  <a
                    key={em}
                    href={`mailto:${em}`}
                    className="block text-slate-700 hover:text-blue-700 hover:underline"
                  >
                    {em}
                  </a>
                ))}
              </div>
            </div>

            {/* Phone */}
            <div className="mt-5 flex items-start gap-3">
              {/* Phone Icon */}
              <svg
                className="w-6 h-6 shrink-0 text-blue-600"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M4.5 5.5c0-.8.6-1.5 1.4-1.5h2c.7 0 1.3.5 1.4 1.2l.4 2.2c.1.6-.2 1.2-.8 1.4l-1.2.5a12.4 12.4 0 006 6l.5-1.2c.2-.6.8-.9 1.4-.8l2.2.4c.7.1 1.2.7 1.2 1.4v2c0 .8-.7 1.4-1.5 1.4A15.5 15.5 0 014.5 5.5z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
              </svg>
              <div className="text-sm space-y-1">
                {CONTACT_INFO.phones.map((ph) => (
                  <a
                    key={ph}
                    href={`tel:${ph.replace(/\s+/g, "")}`}
                    className="block text-slate-700 hover:text-blue-700 hover:underline"
                  >
                    {ph}
                  </a>
                ))}
              </div>
            </div>

            {/* Hours (optional) */}
            {CONTACT_INFO.hours && (
              <div className="mt-5 flex items-start gap-3">
                {/* Clock Icon */}
                <svg
                  className="w-6 h-6 shrink-0 text-blue-600"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="8.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                  <path
                    d="M12 7.5V12l3 1.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
                <div className="text-sm text-slate-700">{CONTACT_INFO.hours}</div>
              </div>
            )}
          </div>
        </aside>

        {/* RIGHT: Contact Form */}
        <div className="lg:col-span-2">
          <form
            onSubmit={onSubmit}
            className="space-y-4 bg-white rounded-2xl border p-6"
            aria-label="Contact form"
          >
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Name *
                </label>
                <input
                  type="text"
                  name="name"
                  value={form.name}
                  onChange={onChange}
                  className="mt-1 block w-full rounded-md border px-3 py-2 outline-none focus:ring-2 focus:ring-blue-600"
                  placeholder="Your name"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Email *
                </label>
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={onChange}
                  className="mt-1 block w-full rounded-md border px-3 py-2 outline-none focus:ring-2 focus:ring-blue-600"
                  placeholder="you@example.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">
                Subject
              </label>
              <input
                type="text"
                name="subject"
                value={form.subject}
                onChange={onChange}
                className="mt-1 block w-full rounded-md border px-3 py-2 outline-none focus:ring-2 focus:ring-blue-600"
                placeholder="How can we help?"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">
                Message *
              </label>
              <textarea
                name="message"
                value={form.message}
                onChange={onChange}
                rows={8}
                className="mt-1 block w-full rounded-md border px-3 py-2 outline-none focus:ring-2 focus:ring-blue-600"
                placeholder="Write your message here..."
                required
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={status.sending}
                className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {status.sending ? "Sending..." : "Send Message"}
              </button>
              {status.ok === true && (
                <span className="text-sm text-green-600">{status.msg}</span>
              )}
              {status.ok === false && (
                <span className="text-sm text-red-600">{status.msg}</span>
              )}
            </div>

            {/* Small privacy note */}
            <p className="text-xs text-slate-500">
              We’ll use your email only to reply to your inquiry.
            </p>
          </form>
        </div>
      </section>
    </main>
  );
};

export default Contact;
