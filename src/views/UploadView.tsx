import * as React from "react";
import { Button, Upload } from 'antd';
import { UploadOutlined } from '@ant-design/icons';

import {
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import WebBundlr from '@bundlr-network/client/build/web';
import BigNumber from 'bignumber.js';

import {
  useConnectionConfig,
} from '../contexts/ConnectionContext';
import {
  notify,
} from '../utils/common';

export type BundlrContextState = {
  bundlr: WebBundlr | null,
}

export const BundlrContext = React.createContext<BundlrContextState | null>(null);

export const BundlrProvider = ({ children }: { children: React.ReactNode }) => {
  const wallet = useWallet();
  const { endpoint } = useConnectionConfig();
  const [bundlr, setBundlr] = React.useState<WebBundlr | null>(null);

  const initBundlr = async () => {
    if (!wallet.connected) return;

    const bundlr = new WebBundlr(
      "https://node1.bundlr.network",
      "solana",
      wallet,
      { providerUrl: endpoint.url },
    );

    let succeeded;
    let message;
    try {
      await bundlr.ready();
      succeeded = !!bundlr.address;
      message = 'Something went wrong';
    } catch (err) {
      console.log(err);
      succeeded = false;
      message = err.message;
    }

    if (!succeeded) {
      notify({
        message: 'Failed to connect to bundlr network',
        description: message,
      })
      return;
    }
    setBundlr(bundlr);
  };

  React.useEffect(() => { initBundlr() }, [wallet, endpoint]);

  return (
    <BundlrContext.Provider
      value={{ bundlr }}
    >
      {children}
    </BundlrContext.Provider>
  );
};

export const useBundlr = () => {
  const context = React.useContext(BundlrContext);
  if (context === null) {
    throw new Error(`useBundlr must be used with a BundlrProvider`);
  }
  return context;
};

export const UploadView: React.FC = (
) => {
  // contexts
  const wallet = useWallet();
  const { bundlr } = useBundlr();

  // user inputs
  // Array<RcFile>
  const [assetList, setAssetList] = React.useState<Array<any>>([]);
  const [uploading, setUploading] = React.useState<boolean>(false);

  // async useEffect
  const [balance, setBalance] = React.useState<BigNumber | null>(null);
  const [price, setPrice] = React.useState<BigNumber | null>(null);

  const getBalance = async () => {
    if (!bundlr) return;
    try {
      const balance = await bundlr.getBalance(bundlr.address);
      setBalance(balance);
    } catch (err) {
      console.log(err);
      notify({
        message: 'Failed to get bundlr balance',
        description: err.message,
      })
    }
  };

  const getPrice = async () => {
    if (!bundlr) return;
    if (assetList.length === 0) return;
    try {
      const price = await bundlr.utils.getPrice(
        'solana', assetList.reduce((c, asset) => c + asset.size, 0));
      setPrice(price);
    } catch (err) {
      console.log(err);
      notify({
        message: 'Failed to get bundlr price',
        description: err.message,
      })
    }
  };

  React.useEffect(() => { getBalance() }, [bundlr]);
  React.useEffect(() => { getPrice() }, [bundlr, assetList]);

  const bundlrUpload = async () => {
    if (balance.lt(price)) {
      try {
        const res = await bundlr.fund(price.minus(balance));
        notify({
          message: `Funded ${res.target}`,
          description: `Transaction ID ${res.id}`,
        })
      } catch (err) {
        console.log(err);
        notify({
          message: `Failed to fund bundlr wallet`,
          description: err.message,
        })
      }
    }

    for (const asset of assetList) {
      try {
        const res = await bundlr.uploader.upload(
          await asset.arrayBuffer(), [{ name: "Content-Type", value: asset.type }]);
        if (res.status !== 200) {
          throw new Error(`Bad status code ${res.status}`);
        }
        notify({
          message: `Uploaded ${asset.name} to bundlr network`,
          description: (
            <a
              href={`https://arweave.net/${res.data.id}`}
              target="_blank"
              rel="noreferrer"
            >
              View on arweave
            </a>
          ),
        })
      } catch (err) {
        console.log(err);
        notify({
          message: `Failed to upload ${asset.name} to bundlr network`,
          description: err.message,
        })
      }
    }
  };

  return (
    <div className="app stack" style={{ margin: 'auto' }}>
      <Upload
        beforeUpload={asset => {
          setAssetList(assetList => [...assetList, asset]);
        }}
        onRemove={asset => {
          setAssetList(assetList => {
            const index = assetList.indexOf(asset);
            const newAssetList = assetList.slice();
            newAssetList.splice(index, 1);
            return newAssetList;
          });
        }}
        fileList={assetList}
      >
        <Button icon={<UploadOutlined />}>select file</Button>
      </Upload>

      {price && (
        <div>
          Price: {price.div(LAMPORTS_PER_SOL).toString()} SOL
        </div>
      )}

      {balance && (
        <div>
          Bundlr balance: {balance.div(LAMPORTS_PER_SOL).toString()} SOL
        </div>
      )}

      <Button
        onClick={() => {
          setUploading(true);
          bundlrUpload();
          setUploading(false);
        }}
        disabled={assetList.length === 0 || !bundlr}
        loading={uploading}
        style={{ marginTop: 16 }}
      >
        {uploading ? 'Uploading' : 'Start Upload'}
      </Button>
    </div>
  );
}
