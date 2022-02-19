import * as React from "react";
import { render } from "react-dom";
import App from "./components/App";
import * as Sentry from "@sentry/react";
import { BrowserTracing } from "@sentry/tracing";
import './styles/index.less';

const rootEl = document.getElementById("root");

Sentry.init({
    dsn: "https://7ae1fb66b8604574b67165c3af367c5c@o1147737.ingest.sentry.io/6219025",
    integrations: [new BrowserTracing()],

    // Set tracesSampleRate to 1.0 to capture 100%
    // of transactions for performance monitoring.
    // We recommend adjusting this value in production
    tracesSampleRate: .8,
});

render(<App />, rootEl);
