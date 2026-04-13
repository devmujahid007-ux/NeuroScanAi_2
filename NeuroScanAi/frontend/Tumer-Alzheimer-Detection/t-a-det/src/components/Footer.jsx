import React from "react";
import { Link } from "react-router-dom";

const Footer = () => {
  return (
    <footer className="bg-gradient-to-br from-blue-900 to-slate-900 text-gray-300 py-10 mt-10">
      <div className="max-w-7xl mx-auto px-6 md:px-10">
        {/* Main Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 border-b border-slate-700 pb-8">
          {/* Brand */}
          <div>
            <h3 className="text-2xl font-bold text-white mb-2">NeuroScan AI</h3>
            <p className="text-sm text-gray-400">
              Revolutionizing early detection of <br />
              <span className="text-blue-400">
                Brain Tumor & Alzheimer's Disease
              </span>{" "}
              using advanced MRI analytics.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-lg font-semibold text-white mb-3">Quick Links</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link
                  to="/"
                  className="hover:text-blue-400 transition-colors duration-200"
                >
                  Home
                </Link>
              </li>
              <li>
                <Link
                  to="/about"
                  className="hover:text-blue-400 transition-colors duration-200"
                >
                  About
                </Link>
              </li>
              <li>
                {/* <Link
                  to="/upload-mri"
                  className="hover:text-blue-400 transition-colors duration-200"
                >
                  Upload MRI
                </Link> */}
              </li>
              <li>
                <Link
                  to="/resources/faq"
                  className="hover:text-blue-400 transition-colors duration-200"
                >
                  FAQ
                </Link>
              </li>
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="text-lg font-semibold text-white mb-3">Resources</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link
                  to="/resources/docs"
                  className="hover:text-blue-400 transition-colors duration-200"
                >
                  Documentation
                </Link>
              </li>
              <li>
                <Link
                  to="/resources/papers"
                  className="hover:text-blue-400 transition-colors duration-200"
                >
                  Research Papers
                </Link>
              </li>
              <li>
                <Link
                  to="/resources/support"
                  className="hover:text-blue-400 transition-colors duration-200"
                >
                  Support
                </Link>
              </li>
              <li>
                <Link
                  to="/contact"
                  className="hover:text-blue-400 transition-colors duration-200"
                >
                  Contact
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact Info */}
          <div>
            <h4 className="text-lg font-semibold text-white mb-3">Contact Us</h4>
            <ul className="space-y-2 text-sm">
              <li>Email: <a href="mailto:support@neuroscan.ai" className="text-blue-400 hover:underline">neuroscan.ai @gmail.com</a></li>
              <li>Phone: +92 3334773180</li>
              <li>Location: Research Lab, Lahore, Pakistan</li>
            </ul>
          </div>
        </div>

        {/* Footer Bottom */}
        <div className="flex flex-col md:flex-row items-center justify-between mt-6 text-sm text-gray-500">
          <p>© {new Date().getFullYear()} NeuroScan AI — All Rights Reserved.</p>
          <div className="flex space-x-4 mt-3 md:mt-0">
            <a
              href="https://twitter.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-blue-400 transition-colors duration-200"
            >
              Twitter
            </a>
            <a
              href="https://github.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-blue-400 transition-colors duration-200"
            >
              GitHub
            </a>
            <a
              href="https://linkedin.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-blue-400 transition-colors duration-200"
            >
              LinkedIn
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
