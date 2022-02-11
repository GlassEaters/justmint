import * as React from "react";
import { BrowserRouter, Switch, Route } from 'react-router-dom';
import { hot } from "react-hot-loader";

import { CoingeckoProvider } from '../contexts/coingecko';
import { ConnectionProvider } from '../contexts/ConnectionContext';
import { LoaderProvider } from '../components/Loader';
import { SPLTokenListProvider } from '../contexts/tokenList';
import { WalletProvider } from '../contexts/WalletContext';
import { AppLayout } from './Layout';

import { SignView } from '../views/SignView';
import { UploadView } from '../views/UploadView';

export const App = () => {
  return (
    <BrowserRouter>
      <ConnectionProvider>
      <SPLTokenListProvider>
      <CoingeckoProvider>
      <LoaderProvider>
      <WalletProvider>
        <AppLayout>
          <Switch>
            <Route exact path="/sign" component={SignView} />
            <Route exact path="/" component={UploadView} />
          </Switch>
        </AppLayout>
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
