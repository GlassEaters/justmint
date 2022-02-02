import * as React from "react";
import { BrowserRouter, Switch, Route } from 'react-router-dom';
import { hot } from "react-hot-loader";

import { CoingeckoProvider } from '../contexts/coingecko';
import { ConnectionProvider } from '../contexts/ConnectionContext';
import { LoaderProvider } from '../components/Loader';
import { SPLTokenListProvider } from '../contexts/tokenList';
import { WalletProvider } from '../contexts/WalletContext';
import { AppLayout } from './Layout';

import { BundlrProvider, UploadView } from '../views/UploadView';

export const App = () => {
  return (
    <BrowserRouter>
      <ConnectionProvider>
      <SPLTokenListProvider>
      <CoingeckoProvider>
      <LoaderProvider>
      <WalletProvider>
      <BundlrProvider>
        <AppLayout>
          <Switch>
            <Route exact path="/" component={UploadView} />
          </Switch>
        </AppLayout>
      </BundlrProvider>
      </WalletProvider>
      </LoaderProvider>
      </CoingeckoProvider>
      </SPLTokenListProvider>
      </ConnectionProvider>
    </BrowserRouter>
  );
}

declare let module: Record<string, unknown>;

export default hot(module)(App);
