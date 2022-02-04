import * as React from "react";
import {
  Button,
  Col,
  Form,
  Input,
  List,
  Row,
  Statistic,
  Table,
  Typography,
  Upload,
} from 'antd';
import { FormInstance } from 'antd/lib/form';
import {
  CheckOutlined,
  CloseOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  UploadOutlined,
} from '@ant-design/icons';

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  MintLayout,
  Token,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  CreateMasterEdition,
  CreateMetadata,
  Creator,
  MasterEdition,
  Metadata,
  MetadataDataData,
  Uses,
} from '@metaplex-foundation/mpl-token-metadata';

import WebBundlr from '@bundlr-network/client/build/web';
import BundlrTransaction from '@bundlr-network/client/build/common/transaction';
import DataItem from 'arbundles/src/DataItem';
import { createData } from 'arbundles/src/ar-data-create';

import BigNumber from 'bignumber.js';
import BN from 'bn.js';
import Mime from 'mime';
import sha3 from 'js-sha3';

import { useWindowDimensions } from '../components/AppBar';
import { CollapsePanel } from '../components/CollapsePanel';
import {
  decLoading,
  incLoading,
  useLoading,
} from '../components/Loader';
import {
  explorerLinkCForAddress,
  sendTransactionWithRetry,
  useConnection,
  useConnectionConfig,
} from '../contexts/ConnectionContext';
import {
  notify,
  shortenAddress,
  useLocalStorageState,
} from '../utils/common';
import {
  SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
} from '../utils/ids';
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


interface Item {
  key: string;
  trait_type: string;
  value: string;
}

interface EditableCellProps extends React.HTMLAttributes<HTMLElement> {
  editing: boolean;
  dataIndex: string;
  title: any;
  record: Item;
  index: number;
  children: React.ReactNode;
}

const EditableCell: React.FC<EditableCellProps> = ({
  editing,
  dataIndex,
  title,
  record,
  index,
  children,
  ...restProps
}) => {
  return (
    <td {...restProps}>
      {editing ? (
        <Form.Item
          name={dataIndex}
          style={{ margin: 0 }}
          rules={[
            {
              required: true,
              message: `Please Input ${title}!`,
            },
          ]}
        >
          <Input.TextArea autoSize />
        </Form.Item>
      ) : (
        children
      )}
    </td>
  );
};

const EditableTable = (
  { data, setData }: {
    data: Array<Item>,
    setData: React.Dispatch<React.SetStateAction<Array<Item>>>,
  },
) => {
  const [form] = Form.useForm();
  const [counter, setCounter] = React.useState(0);
  const [editingKey, setEditingKey] = React.useState('');

  const isEditing = (record: Item) => record.key === editingKey;
  const addRecord = { trait_type: '', value: '', key: '' };

  const edit = (record: Partial<Item> & { key: React.Key }) => {
    form.setFieldsValue({ trait_type: '', value: '', ...record });
    setEditingKey(record.key);
  };

  const cancel = () => {
    setEditingKey('');
  };

  const save = async (key: React.Key) => {
    try {
      const row = (await form.validateFields()) as Item;

      const newData = [...data];
      const index = newData.findIndex(item => key === item.key);
      if (index > -1) {
        const item = newData[index];
        newData.splice(index, 1, {
          ...item,
          ...row,
        });
        setData(newData);
        setEditingKey('');
      } else {
        row.key = key.toString();
        newData.push(row);
        setData(newData);
        setEditingKey('');
      }
    } catch (errInfo) {
      console.log('Validate Failed:', errInfo);
    }
  };

  const remove = (record: Partial<Item> & { key: React.Key }) => {
    const newData = [...data];
    setData(newData.filter(item => item.key !== record.key));
  };

  const columns = [
    {
      title: 'Trait Type',
      dataIndex: 'trait_type',
      width: '30%',
      editable: true,
    },
    {
      title: 'Value',
      dataIndex: 'value',
      editable: true,
    },
    {
      title: 'Action',
      dataIndex: 'Action',
      width: '5%',
      render: (_: any, record: Item) => {
        // special
        if (record.key === '') {
          return (
            <span>
              <Typography.Link
                disabled={editingKey !== ''}
                onClick={() => {
                  const wrap = async () => {
                    await save(counter);
                    form.setFieldsValue(addRecord);
                    setCounter(counter + 1);
                  };
                  wrap();
                }}
              >
                <PlusOutlined/>
              </Typography.Link>
            </span>
          );
        }
        const editable = isEditing(record);
        return editable ? (
          <span>
            <Typography.Link
              onClick={() => {
                const wrap = async () => {
                  await save(record.key);
                  edit({ key: ''});
                };
                wrap();
              }}
              style={{ marginRight: 8 }}
            >
              <CheckOutlined />
            </Typography.Link>
            <Typography.Link
              onClick={() => edit({ key: '' })}
            >
              <CloseOutlined />
            </Typography.Link>
          </span>
        ) : (
          <span>
            <Typography.Link
              disabled={editingKey !== ''}
              onClick={() => edit(record)}
              style={{ marginRight: 8 }}
            >
              <EditOutlined />
            </Typography.Link>
            <Typography.Link
              disabled={editingKey !== ''}
              onClick={() => remove(record)}
            >
              <DeleteOutlined />
            </Typography.Link>
          </span>
        );
      },
    },
  ];

  const mergedColumns = columns.map(col => {
    if (!col.editable) {
      return col;
    }
    return {
      ...col,
      onCell: (record: Item) => ({
        record,
        dataIndex: col.dataIndex,
        title: col.title,
        editing: isEditing(record),
      }),
    };
  });

  return (
    <Form form={form} component={false}>
      <Table
        components={{
          body: {
            cell: EditableCell,
          },
        }}
        bordered
        dataSource={[...data, addRecord]}
        columns={mergedColumns}
        rowClassName="editable-row"
        pagination={false}
      />
    </Form>
  );
};


/**
 * Tags to include with every individual transaction.
 */
const BASE_TAGS = [{ name: 'App-Name', value: 'Just Mint' }];

const contentTypeTags = {
  json: { name: 'Content-Type', value: 'application/json' },
  'arweave-manifest': {
    name: 'Content-Type',
    value: 'application/x.arweave-manifest+json',
  },
};

const manifestTags = [...BASE_TAGS, contentTypeTags['json']];

const arweavePathManifestTags = [
  ...BASE_TAGS,
  contentTypeTags['arweave-manifest'],
];

/**
 * The Arweave Path Manifest object for a given asset file pair.
 * https://github.com/ArweaveTeam/arweave/blob/master/doc/path-manifest-schema.md
 */
type ArweavePathManifest = {
  manifest: 'arweave/paths';
  version: '0.1.0';
  paths: {
    [key: string]: {
      id: string; // arweave transaction id
    };
    'metadata.json': {
      id: string; // arweave transaction id
    };
  };
  index: {
    path: 'metadata.json';
  };
};

/**
 * Create the Arweave Path Manifest from the asset image / manifest
 * pair txIds, helps Arweave Gateways find the files.
 * Instructs arweave gateways to serve metadata.json by default
 * when accessing the transaction.
 * See:
 * - https://github.com/ArweaveTeam/arweave/blob/master/doc/path-manifest-schema.md
 * - https://github.com/metaplex-foundation/metaplex/pull/859#pullrequestreview-805914075
 */
function createArweavePathManifest(
  // TODO: diffentiate outside of mediaType
  images: {
    imageTxId: string,
    mediaType: string,
  }[],
  manifestTxId: string,
): ArweavePathManifest {
  const arweavePathManifest: ArweavePathManifest = {
    manifest: 'arweave/paths',
    version: '0.1.0',
    paths: {
      ...images.reduce((a, { imageTxId, mediaType }) => ({
        ...a,
        [`image${mediaType}`]: {
          id: imageTxId,
        },
      }), {}),
      'metadata.json': {
        id: manifestTxId,
      },
    },
    index: {
      path: 'metadata.json',
    },
  };

  return arweavePathManifest;
}

// The size in bytes of a dummy Arweave Path Manifest.
// Used to account for the size of a file pair manifest, in the computation
// of a bundle range.
const dummyAreaveManifestByteSize = (() => {
  const dummyAreaveManifest = createArweavePathManifest(
    [
      {
        imageTxId: 'akBSbAEWTf6xDDnrG_BHKaxXjxoGuBnuhMnoYKUCDZo',
        mediaType: '.png',
      }
    ],
    'akBSbAEWTf6xDDnrG_BHKaxXjxoGuBnuhMnoYKUCDZo',
  );
  return Buffer.byteLength(JSON.stringify(dummyAreaveManifest));
})();

export const mintNFTInstructions = async (
  connection: Connection,
  walletKey: PublicKey,
  metadataData: MetadataDataData,
  maxSupply: BN,
): Promise<{ mint: Keypair, instructions: Array<TransactionInstruction> }> => {
  // Retrieve metadata

  // Allocate memory for the account
  const mintRent = await connection.getMinimumBalanceForRentExemption(
    MintLayout.span,
  );

  // Generate a mint
  const mint = Keypair.generate();
  const instructions: TransactionInstruction[] = [];

  instructions.push(
    SystemProgram.createAccount({
      fromPubkey: walletKey,
      newAccountPubkey: mint.publicKey,
      lamports: mintRent,
      space: MintLayout.span,
      programId: TOKEN_PROGRAM_ID,
    }),
  );
  instructions.push(
    Token.createInitMintInstruction(
      TOKEN_PROGRAM_ID,
      mint.publicKey,
      0,
      walletKey,
      walletKey,
    ),
  );

  const userTokenAccoutAddress = await Token.getAssociatedTokenAddress(
    SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    mint.publicKey,
    walletKey,
    true,
  );
  instructions.push(
    Token.createAssociatedTokenAccountInstruction(
      SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      mint.publicKey,
      userTokenAccoutAddress,
      walletKey,
      walletKey,
    ),
  );

  // Create metadata
  const metadataAccount = await Metadata.getPDA(mint.publicKey);
  instructions.push(
    ...new CreateMetadata(
      {
        feePayer: walletKey,
      },
      {
        metadata: metadataAccount,
        metadataData,
        updateAuthority: walletKey,
        mint: mint.publicKey,
        mintAuthority: walletKey,
      }
    ).instructions,
  );

  instructions.push(
    Token.createMintToInstruction(
      TOKEN_PROGRAM_ID,
      mint.publicKey,
      userTokenAccoutAddress,
      walletKey,
      [],
      1,
    ),
  );

  // Create master edition
  const editionAccount = await MasterEdition.getPDA(mint.publicKey);
  instructions.push(
    ...new CreateMasterEdition(
      {
        feePayer: walletKey,
      },
      {
        edition: editionAccount,
        metadata: metadataAccount,
        updateAuthority: walletKey,
        mint: mint.publicKey,
        mintAuthority: walletKey,
        maxSupply,
      }
    ).instructions,
  );

  return {
    mint,
    instructions,
  }
};

export const UploadView: React.FC = (
) => {
  // contexts
  const connection = useConnection();
  const wallet = useWallet();
  const { bundlr } = useBundlr();

  // user inputs
  // Array<RcFile>
  const [coverAsset, setCoverAsset] = React.useState<Array<any>>([]);
  const [additionalAssets, setAdditionalAssets] = React.useState<Array<any>>([]);

  const { setLoading } = useLoading();
  const [name, setName] = useLocalStorageState('name', '');
  const [description, setDescription] = useLocalStorageState('description', '');
  const [attributes, setAttributes] = useLocalStorageState('attributes', []);
  const [externalUrl, setExternalUrl] = useLocalStorageState('externalUrl', '');

  // derived + async useEffect
  const assetList = [...coverAsset, ...additionalAssets];
  const [balance, setBalance] = React.useState<BigNumber | null>(null);
  const [price, setPrice] = React.useState<BigNumber | null>(null);
  const [uploaded, setUploaded] = React.useState<Array<UploadMeta | null>>([]);
  const [signer, setSigner] = React.useState<Keypair | null>(null);

  const formatManifest = (
    assetLinks: Array<string>,
    category: string,
  ) => {
    return {
      name,
      description,
      image: assetLinks[0],
      external_url: externalUrl,
      attributes,
      properties: {
        files: assetLinks.slice(1),
        category,
      },
    };
  };

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
    try {
      const lengths = [
        ...assetList.map(asset => asset.size),
        JSON.stringify(formatManifest(
          assetList.map(() => " ".repeat(50)), // fluff
          " ".repeat(50), // fluff
        )).length,
        dummyAreaveManifestByteSize,
      ];
      const price = (await Promise.all(lengths.map(
        l => bundlr.utils.getPrice('solana', l)
      ))).reduce((c, d) => c.plus(d), new BigNumber(0));
      setPrice(price);
    } catch (err) {
      console.log('Failed to get bundlr price', err.message);
    }
  };

  React.useEffect(() => { getBalance() }, [bundlr]);
  React.useEffect(() => { getPrice() }, [bundlr, coverAsset, additionalAssets]);

  const deriveSigner = async () => {
    const message = 'JustMint SecretKey';
    const signature = await wallet.signMessage(Buffer.from(message));
    const hash = sha3.sha3_512.arrayBuffer(signature);
    const digest = Buffer.from(hash.slice(0, 32));

    const signer = Keypair.fromSeed(digest);

    notify({
      message: 'Derived signer key',
      description: explorerLinkCForAddress(
        signer.publicKey.toBase58(), connection),
    });
    setSigner(signer);
  };

  const bundlrUpload = async () => {
    if (assetList.length === 0) {
      throw new Error('Must upload at least 1 asset');
    }
    const c = bundlr.utils.currencyConfig;
    const bundlrSigner = await c.getSigner();
    const assetDataItems = await Promise.all(assetList.map(async (asset) => {
      return createData(
        await asset.arrayBuffer(),
        bundlrSigner,
        { tags: [{ name: "Content-Type", value: asset.type }] },
      );
    }));

    // TODO: manual signAll?
    for (const dataItem of assetDataItems) {
      await dataItem.sign(bundlrSigner);
    }

    const manifest = formatManifest(
      assetDataItems.map(
        a => `https://arweave.net/${a.id}`
      ),
      Mime.getType(assetList[0].type),
    );

    const manifestDataItem = bundlr.createTransaction(
      JSON.stringify(manifest), { tags: manifestTags });

    await (manifestDataItem as BundlrTransaction).sign();

    const arweavePathManifest = createArweavePathManifest(
      assetDataItems.map((assetDataItem, idx) => ({
        imageTxId: assetDataItem.id,
        mediaType: `.${Mime.getExtension(assetList[idx].type)}`,
      })),
      manifestDataItem.id,
    );

    const arweavePathManifestDataItem = bundlr.createTransaction(
      JSON.stringify(arweavePathManifest),
      { tags: arweavePathManifestTags },
    );

    await (arweavePathManifestDataItem as BundlrTransaction).sign();

    const dataItems = [
      ...assetDataItems,
      manifestDataItem,
      arweavePathManifestDataItem,
    ];

    const price = (await Promise.all(dataItems.map(
      d => bundlr.utils.getPrice('solana', d.data.length)
    ))).reduce((c, d) => c.plus(d), new BigNumber(0));
    notify({
      message: `Bundlr Price ${price.div(LAMPORTS_PER_SOL).toString()}`,
    });

    if (balance.lt(price)) {
      try {
        const amount = price.minus(balance);
        const multiplier = 1.1; // adjusted up to avoid spurious failures...

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
    for (let idx = 0; idx < dataItems.length; ++idx) {
      const dataItem = dataItems[idx];
      let name;
      if (idx < assetList.length) {
        name = assetList[idx].name;
      } else if (idx == assetList.length) {
        name = 'metadata.json';
      } else {
        name = 'arweave-manifest';
      };
      try {
        const res = await bundlr.uploader.dataItemUploader(
          dataItem as BundlrTransaction);
        if (res.status !== 200 && res.status != 201) {
          throw new Error(`Bad status code ${res.status}`);
        }
        notify({
          message: `Uploaded ${name} to bundlr network`,
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
          name: name,
        });
      } catch (err) {
        console.log(err);
        notify({
          message: `Failed to upload ${name} to bundlr network`,
          description: err.message,
        })
        uploaded.push({
          arweave: null,
          name: name,
        });
      }

      setUploaded(uploaded);
    }

    const metadataLink = uploaded[assetList.length].arweave;
    const { instructions, mint } = await mintNFTInstructions(
      connection,
      wallet.publicKey,
      new MetadataDataData({
        name: name,
        symbol: '',
        uri: metadataLink,
        sellerFeeBasisPoints: 0,
        creators: [
          new Creator({
            address: wallet.publicKey.toBase58(),
            verified: true,
            share: 100,
          })
        ],
      }),
      new BN(0),
    );

    const result = await sendTransactionWithRetry(
      connection,
      wallet,
      instructions,
      [mint],
    );

    console.log(result);
    if (typeof result === "string") {
      throw new Error(result);
    } else {
      notify({
        message: "Mint succeeded",
        description: explorerLinkCForAddress(
          mint.publicKey.toBase58(), connection),
      });
      await connection.confirmTransaction(result.txid, 'finalized');
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
        maxWidth: Math.min(width, maxWidth),
      }}
    >
      <Row>
      <Col span={12}>
      <Statistic title="Price Est." value={price ? price.div(LAMPORTS_PER_SOL).toString() : 0} />
      </Col>

      <Col span={12}>
      <Statistic title="Balance" value={balance ? balance.div(LAMPORTS_PER_SOL).toString() : 0} />
      </Col>
      </Row>

      <label className="action-field">
        <span className="field-title">Name</span>
        <Input.TextArea
          id="name-field"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoSize
        />
      </label>

      <label className="action-field">
        <span className="field-title">Description</span>
        <Input.TextArea
          id="name-field"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          autoSize
        />
      </label>

      <div>
      <Upload
        beforeUpload={asset => { setCoverAsset([asset]); }}
        onRemove={() => { setCoverAsset([]); }}
        listType="picture"
        fileList={coverAsset}
        className="select-file-upload"
      >
        <Button>
          Select Cover Image
        </Button>
      </Upload>
      </div>

      <CollapsePanel
        id="additional-options"
        panelName="Additional Options"
      >
      <label className="action-field">
        <span className="field-title">External URL</span>
        <Input.TextArea
          id="name-field"
          value={externalUrl}
          onChange={(e) => setExternalUrl(e.target.value)}
          autoSize
        />
      </label>

      <label className="action-field">
        <span className="field-title">Attributes</span>
        <EditableTable
          data={attributes}
          setData={setAttributes}
        />
      </label>

      <Upload
        beforeUpload={asset => {
          setAdditionalAssets(assetList => [...assetList, asset]);
        }}
        onRemove={asset => {
          setAdditionalAssets(assetList => {
            const index = assetList.indexOf(asset);
            const newAssetList = assetList.slice();
            newAssetList.splice(index, 1);
            return newAssetList;
          });
        }}
        listType="picture"
        fileList={additionalAssets}
        className="select-file-upload"
      >
        <Button>
          Add File
        </Button>
      </Upload>
      </CollapsePanel>

      <div>
      <Button
        icon={<UploadOutlined />}
        onClick={() => {
          const wrap = async () => {
            setLoading(incLoading);
            try {
              await bundlrUpload();
            } catch (err) {
              console.log(err);
              notify({
                message: `Bundlr upload failed`,
                description: err.message,
              })
            }
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
