import * as React from "react";
import {
  Button,
  Col,
  List,
  Row,
  Statistic,
  Upload,
} from 'antd';
import { UploadOutlined } from '@ant-design/icons';

import {
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import WebBundlr from '@bundlr-network/client/build/web';
import BigNumber from 'bignumber.js';

import { useWindowDimensions } from '../components/AppBar';
import {
  decLoading,
  incLoading,
  useLoading,
} from '../components/Loader';
import {
  useConnection,
  useConnectionConfig,
} from '../contexts/ConnectionContext';
import {
  notify,
  shortenAddress,
} from '../utils/common';
import {
  explorerLinkFor,
} from '../utils/transactions';

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

type UploadMeta = {
  arweave: string | null,
  name: string,
};

export const UploadView: React.FC = (
) => {
  // contexts
  const connection = useConnection();
  const { bundlr } = useBundlr();

  // user inputs
  // Array<RcFile>
  const [assetList, setAssetList] = React.useState<Array<any>>([]);
  const { setLoading } = useLoading();

  // async useEffect
  const [balance, setBalance] = React.useState<BigNumber | null>(null);
  const [price, setPrice] = React.useState<BigNumber | null>(null);
  const [uploaded, setUploaded] = React.useState<Array<UploadMeta | null>>([]);

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
    if (assetList.length === 0) {
      setPrice(null);
      return;
    }
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
        const amount = price.minus(balance);
        const multiplier = 1.1; // adjusted up to avoid spurious failures...

        const c = bundlr.utils.currencyConfig;
        const to = await bundlr.utils.getBundlerAddress(bundlr.utils.currency);
        const baseFee = await c.getFee(amount, to)
        const fee = (baseFee.multipliedBy(multiplier)).toFixed(0).toString();
        const tx = await c.createTx(amount, to, fee.toString());
        tx.txId = await c.sendTx(tx.tx);

        notify({
          message: `Funded ${shortenAddress(to)}. Waiting confirmation`,
          description: (
            <a
              href={explorerLinkFor(tx.txId, connection)}
              target="_blank"
              rel="noreferrer"
            >
              View on explorer
            </a>
          ),
        })

        await connection.confirmTransaction(tx.txId, 'finalized');

        const res = await bundlr.utils.api.post(
            `/account/balance/${bundlr.utils.currency}`, { tx_id: tx.txId });

        if (res.status != 200) {
          const context = 'Posting transaction information to the bundlr';
          throw new Error(`HTTP Error: ${context}: ${res.status} ${res.statusText.length == 0 ? res.data : res.statusText}`);
        }

        notify({
          message: `Posted funding transaction`,
        })
      } catch (err) {
        console.log(err);
        notify({
          message: `Failed to fund bundlr wallet`,
          description: err.message,
        })
        return;
      }
    }

    const uploaded: Array<UploadMeta | null> = [];
    for (const asset of assetList) {
      try {
        const res = await bundlr.uploader.upload(
          await asset.arrayBuffer(), [{ name: "Content-Type", value: asset.type }]);
        if (res.status !== 200 && res.status != 201) {
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
        uploaded.push({
          arweave: res.data.id,
          name: asset.name,
        });
      } catch (err) {
        console.log(err);
        notify({
          message: `Failed to upload ${asset.name} to bundlr network`,
          description: err.message,
        })
        uploaded.push({
          arweave: null,
          name: asset.name,
        });
      }

      setUploaded(uploaded);
    }

    // refresh
    await getBalance();
  };

  const maxWidth = 960;
  const { width } = useWindowDimensions();
  return (
    <div
      className="app stack arweave-upload"
      style={{
        margin: 'auto',
        width: Math.min(width, maxWidth),
      }}
    >
      <Row>
      <Col span={12}>
      <Statistic title="Price" value={price ? price.div(LAMPORTS_PER_SOL).toString() : 0} />
      </Col>

      <Col span={12}>
      <Statistic title="Balance" value={balance ? balance.div(LAMPORTS_PER_SOL).toString() : 0} />
      </Col>
      </Row>

      <div>
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
        listType="picture"
        fileList={assetList}
        className="select-file-upload"
      >
        <Button icon={<UploadOutlined />}>
          select file
        </Button>
      </Upload>
      </div>

      <div>
      <Button
        onClick={() => {
          const wrap = async () => {
            setLoading(incLoading);
            await bundlrUpload();
            setLoading(decLoading);
          };
          wrap();
        }}
        disabled={assetList.length === 0 || !bundlr}
      >
        Upload
      </Button>
      </div>

      {uploaded.length !== 0 && <List
        itemLayout="horizontal"
        dataSource={uploaded}
        renderItem={(key: UploadMeta | null) => (
          <List.Item>
            <List.Item.Meta
              title={(
                <div>
                  {key.name}
                </div>
              )}
              description={key.arweave && (
                <div>
                  <span className="field-title">Arweave{"\u00A0"}</span>
                  <a
                    href={`https://arweave.net/${key.arweave}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {key.arweave}
                  </a>
                </div>
              )}
            />
          </List.Item>
        )}
      />}
    </div>
  );
}
