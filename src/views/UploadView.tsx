import * as React from "react";
import {
  Button,
  Col,
  Input,
  InputNumber,
  List,
  Row,
  Statistic,
  Switch,
  Tabs,
  Tooltip,
  Upload,
} from "antd";
import { QuestionCircleOutlined, UploadOutlined } from "@ant-design/icons";

import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  sendAndConfirmRawTransaction,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  TransactionSignature,
} from "@solana/web3.js";
import {
  AccountLayout,
  MintLayout,
  Token,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  CreateMasterEditionV3,
  CreateMetadataV2,
  Creator,
  DataV2,
  MasterEdition,
  MAX_NAME_LENGTH,
  Metadata,
} from "@metaplex-foundation/mpl-token-metadata";

import { WebBundlr } from "@bundlr-network/client/web";
import SolanaConfig from "@bundlr-network/client/web/currencies/solana";
import SolanaSigner from "arbundles/src/signing/chains/SolanaSigner";
import { createData } from "arbundles/src/ar-data-create";

import BigNumber from "bignumber.js";
import BN from "bn.js";
import Mime from "mime";
import sha3 from "js-sha3";
import bs58 from "bs58";

import { useWindowDimensions } from "../components/AppBar";
import { ConnectButton } from "../components/ConnectButton";
import { CollapsePanel } from "../components/CollapsePanel";
import { EditableTable } from "../components/EditableTable";
import { MetaplexModal } from "../components/MetaplexModal";
import { decLoading, incLoading, useLoading } from "../components/Loader";
import {
  explorerLinkCForAddress,
  sendTransactionWithRetry,
  useConnection,
  useConnectionConfig,
} from "../contexts/ConnectionContext";
import { notify, shortenAddress, useLocalStorageState } from "../utils/common";
import { SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID } from "../utils/ids";
import { explorerLinkFor } from "../utils/transactions";
const DONATION = 5000000;
type DonationConfig = {
  creators: boolean;
  charity: boolean;
};
type UploadMeta = {
  arweave: string | null;
  name: string;
};

/**
 * Tags to include with every individual transaction.
 */
const BASE_TAGS = [{ name: "App-Name", value: "Just Mint" }];

const contentTypeTags = {
  json: { name: "Content-Type", value: "application/json" },
  "arweave-manifest": {
    name: "Content-Type",
    value: "application/x.arweave-manifest+json",
  },
};

const manifestTags = [...BASE_TAGS, contentTypeTags["json"]];

const arweavePathManifestTags = [
  ...BASE_TAGS,
  contentTypeTags["arweave-manifest"],
];

/**
 * The Arweave Path Manifest object for a given asset file pair.
 * https://github.com/ArweaveTeam/arweave/blob/master/doc/path-manifest-schema.md
 */
type ArweavePathManifest = {
  manifest: "arweave/paths";
  version: "0.1.0";
  paths: {
    [key: string]: {
      id: string; // arweave transaction id
    };
    "metadata.json": {
      id: string; // arweave transaction id
    };
  };
  index: {
    path: "metadata.json";
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
    imageTxId: string;
    mediaType: string;
  }[],
  manifestTxId: string,
): ArweavePathManifest {
  const arweavePathManifest: ArweavePathManifest = {
    manifest: "arweave/paths",
    version: "0.1.0",
    paths: {
      ...images.reduce(
        (a, { imageTxId, mediaType }) => ({
          ...a,
          [`image${mediaType}`]: {
            id: imageTxId,
          },
        }),
        {},
      ),
      "metadata.json": {
        id: manifestTxId,
      },
    },
    index: {
      path: "metadata.json",
    },
  };

  return arweavePathManifest;
}

function donationAddress(donationConfig: DonationConfig) {
  if (donationConfig.creators) {
    return new PublicKey("GheJkHWyNsSPLUT77Y6YSeb8RkXmYx8SGEFZjixnw2Eq");
  } else {
    return new PublicKey("9dbXZYx5JxwCtbA9LnqFySfgtaV514JTxt9hwEjCDKYU");
  }
}

// The size in bytes of a dummy Arweave Path Manifest.
// Used to account for the size of a file pair manifest, in the computation
// of a bundle range.
const dummyAreaveManifestByteSize = (() => {
  const dummyAreaveManifest = createArweavePathManifest(
    [
      {
        imageTxId: "akBSbAEWTf6xDDnrG_BHKaxXjxoGuBnuhMnoYKUCDZo",
        mediaType: ".png",
      },
    ],
    "akBSbAEWTf6xDDnrG_BHKaxXjxoGuBnuhMnoYKUCDZo",
  );
  return Buffer.byteLength(JSON.stringify(dummyAreaveManifest));
})();

let _mintCost: CostBreakdown = {
  mint: 0,
  metadata: 0,
  donation: DONATION,
  loaded: false,
};
type CostBreakdown = {
  mint: number;
  metadata: number;
  donation: number;
  loaded: boolean;
};
export const getMintCost = async (
  connection: Connection,
): Promise<CostBreakdown> => {
  if (!_mintCost.loaded) {
    _mintCost = Object.assign(_mintCost, {
      mint: await connection.getMinimumBalanceForRentExemption(MintLayout.span),
      metadata: await connection.getMinimumBalanceForRentExemption(
        679 + 282 + AccountLayout.span,
      ),
      loaded: true,
    });
  }
  return Promise.resolve(_mintCost);
};
export const mintNFTInstructions = async (
  walletKey: PublicKey,
  metadataData: DataV2,
  maxSupply: BN | null,
  cost: number,
  donationAddress: PublicKey,
): Promise<{ mint: Keypair; instructions: Array<TransactionInstruction> }> => {
  // Retrieve metadata
  // Generate a mint
  const mint = Keypair.generate();
  const instructions: TransactionInstruction[] = [];

  instructions.push(
    SystemProgram.createAccount({
      fromPubkey: walletKey,
      newAccountPubkey: mint.publicKey,
      lamports: cost,
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
    SystemProgram.transfer({
      fromPubkey: walletKey,
      toPubkey: donationAddress,
      lamports: DONATION,
    }),
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
    ...new CreateMetadataV2(
      {
        feePayer: walletKey,
      },
      {
        metadata: metadataAccount,
        metadataData,
        updateAuthority: walletKey,
        mint: mint.publicKey,
        mintAuthority: walletKey,
      },
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
    ...new CreateMasterEditionV3(
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
      },
    ).instructions,
  );

  return {
    mint,
    instructions,
  };
};

export const UploadView: React.FC = () => {
  // contexts
  const connection = useConnection();
  const { endpoint } = useConnectionConfig();
  const wallet = useWallet();

  // user inputs
  // Array<RcFile>
  const [coverAsset, setCoverAsset] = React.useState<Array<any>>([]);
  const [additionalAssets, setAdditionalAssets] = React.useState<Array<any>>(
    [],
  );

  const { setLoading } = useLoading();
  const [name, setName] = useLocalStorageState("name", "");
  const [description, setDescription] = useLocalStorageState("description", "");
  const [attributes, setAttributes] = useLocalStorageState("attributes", []);
  const [externalUrl, setExternalUrl] = useLocalStorageState("externalUrl", "");
  const [sellerFeeBasisPoints, setSellerFeeBasisPoints] = useLocalStorageState(
    "sellerFeeBasisPoints",
    0,
  );
  const [creators, setCreators] = useLocalStorageState("creators", []);
  const [hasMaxEditions, setHasMaxEditions] = useLocalStorageState(
    "hasMaxEditions",
    true,
  );
  const [maxEditions, setMaxEditions] = useLocalStorageState("maxEditions", 0);
  const [showAddFundsModal, setShowAddFundsModal] = React.useState(false);
  const [fundBundlrAmount, setFundBundlrAmount] = React.useState(0);
  const [recoverBundlrTxId, setRecoverBundlrTxId] = React.useState("");

  const [donationConfig, setDonationConfig] = React.useState<DonationConfig>({
    charity: true,
    creators: false,
  });

  // derived + async useEffect
  const [requiredCreatorShare, setRequiredCreatorShare] = useLocalStorageState(
    "requiredCreatorShare",
    "100",
  );
  const requiredCreators = wallet.publicKey
    ? [
        {
          creator: wallet.publicKey.toBase58(),
          share: requiredCreatorShare,
          key: 0,
        },
      ]
    : [];
  const isRequiredCreator = (r: any) =>
    r.creator === wallet.publicKey.toBase58();
  const allCreators = [...requiredCreators, ...creators];
  const assetList = [...coverAsset, ...additionalAssets];
  const [balance, setBalance] = React.useState<BigNumber | null>(null);
  const [price, setPrice] = React.useState<BigNumber | null>(null);
  const [mintPrice, setMintPrice] = React.useState<CostBreakdown>(_mintCost);
  const [uploaded, setUploaded] = React.useState<Array<UploadMeta | null>>([]);

  const [signerStr, setSigner] = useLocalStorageState("bundlrSigner", "");
  const [bundlr, setBundlr] = React.useState<WebBundlr | null>(null);

  const formatManifest = (assetLinks: Array<string>, category: string) => {
    return {
      name,
      description,
      image: assetLinks[0],
      external_url: externalUrl,
      attributes,
      properties: {
        files: assetLinks.slice(),
        category,
      },
    };
  };

  const getBalance = async () => {
    if (!bundlr) return;
    try {
      const balance = await bundlr.getLoadedBalance();
      setBalance(balance);
    } catch (err) {
      console.log(err);
      notify({
        message: "Failed to get bundlr balance",
        description: err.message,
      });
    }
  };
  React.useEffect(() => {
    getMintCost(connection).then((cost) => {
      setMintPrice(cost);
    });
  });
  const getPrice = async () => {
    if (!bundlr) return;
    try {
      const lengths = [
        ...assetList.map((asset) => asset.size),
        JSON.stringify(
          formatManifest(
            assetList.map(() => " ".repeat(50)), // fluff
            " ".repeat(50), // fluff
          ),
        ).length,
        dummyAreaveManifestByteSize,
      ].map((l) => Math.ceil((l * 4) / 3)); // base64 encoded
      const price = (
        await Promise.all(
          lengths.map((l) => bundlr.utils.getPrice("solana", l)),
        )
      ).reduce((c, d) => c.plus(d), new BigNumber(0));
      setPrice(price);
    } catch (err) {
      console.log("Failed to get bundlr + mint price", err.message);
    }
  };

  const initBundlr = async () => {
    if (!signerStr) return;

    const bundlrReadKey = bs58.encode([
      ...bs58.decode(signerStr).slice(32),
      ...bs58.decode(signerStr).slice(0, 32),
    ]);
    const rawSigner = new SolanaSigner(bundlrReadKey);
    console.log("raw", rawSigner);

    const bundlr = new WebBundlr(
      "https://node1.bundlr.network",
      "solana",
      rawSigner,
      { providerUrl: endpoint.url },
    );

    // override injected
    (bundlr.utils.currencyConfig as SolanaConfig)["signer"] = rawSigner;

    // manually ready...
    bundlr.address = new PublicKey(bs58.decode(signerStr).slice(0, 32));

    setBundlr(bundlr);
  };

  React.useEffect(() => {
    initBundlr();
  }, [signerStr, endpoint]);
  React.useEffect(() => {
    getBalance();
  }, [bundlr]);
  React.useEffect(() => {
    getPrice();
  }, [bundlr, coverAsset, additionalAssets]);
  React.useEffect(() => {
    if (wallet.disconnecting) {
      setSigner("");
      setBundlr(null);
    }
  }, [wallet]);

  const deriveSigner = async () => {
    const message = "JustMint SecretKey";
    const signature = await (wallet.adapter as any).signMessage(
      Buffer.from(message),
    );
    const hash = sha3.sha3_512.arrayBuffer(signature);
    const digest = Buffer.from(hash.slice(0, 32));

    const signer = Keypair.fromSeed(digest);

    setSigner(
      bs58.encode([...signer.publicKey.toBuffer(), ...signer.secretKey]),
    );
    notify({
      message: "Derived signer key",
      description: explorerLinkCForAddress(
        signer.publicKey.toBase58(),
        connection,
      ),
    });
  };

  const checkCreators = async () => {
    let total = 0;
    for (const creator of allCreators) {
      // double check. these should also be validated by form
      let creatorKey;
      try {
        creatorKey = new PublicKey(creator.creator).toBase58();
      } catch (err) {
        throw new Error(
          `Invalid creator pubkey ${creator.creator}: ${err.message}`,
        );
      }
      if (creator.creator !== creatorKey) {
        throw new Error(`Invalid creator pubkey ${creator.creator}`);
      }
      const share = Number(creator.share);
      if (isNaN(share))
        throw new Error(`Could not parse share for ${creator.creator}`);
      if (Math.floor(share) !== share)
        throw new Error(`Share for ${creator.creator} contains decimals`);
      total += share;
    }
    if (total !== 100) {
      throw new Error(`Creator shares must add up to 100. Got ${total}`);
    }
  };

  const fundBundlr = async (amount: BigNumber) => {
    const signer = new Keypair({
      publicKey: bs58.decode(signerStr).slice(0, 32),
      secretKey: bs58.decode(signerStr).slice(32),
    });
    const to = await bundlr.utils.getBundlerAddress(bundlr.utils.currency);

    const { blockhash: recentBlockhash, feeCalculator } =
      await connection.getRecentBlockhash();

    {
      const transaction = new Transaction({
        recentBlockhash,
        feePayer: wallet.publicKey,
      });

      // fund temporary
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: signer.publicKey,
          lamports: +amount
            .plus(new BigNumber(feeCalculator.lamportsPerSignature))
            .toNumber(),
        }),
      );

      transaction.setSigners(wallet.publicKey);
      await wallet.signTransaction(transaction);

      await sendAndConfirmRawTransaction(connection, transaction.serialize(), {
        commitment: "confirmed",
      });
    }

    let txId: TransactionSignature;
    {
      const transaction = new Transaction({
        recentBlockhash,
        feePayer: signer.publicKey,
      });

      // fund bundlr from temporary (which signed the data items)
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: signer.publicKey,
          toPubkey: new PublicKey(to),
          lamports: +new BigNumber(amount).toNumber(),
        }),
      );

      transaction.setSigners(signer.publicKey);
      transaction.sign(signer);

      txId = await connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: true,
      });
    }

    notify({
      message: `Funded ${shortenAddress(to)}. Waiting confirmation`,
      description: (
        <a
          href={explorerLinkFor(txId, connection)}
          target="_blank"
          rel="noreferrer"
          style={{
            color: "#7448A3",
          }}
        >
          View on explorer
        </a>
      ),
    });

    await connection.confirmTransaction(txId, "finalized");

    await postFunding(txId);
  };

  const postFunding = async (txId: TransactionSignature) => {
    const res = await bundlr.utils.api.post(
      `/account/balance/${bundlr.utils.currency}`,
      { tx_id: txId },
    );

    if (res.status != 200) {
      const context = "Posting transaction information to the bundlr";
      throw new Error(
        `HTTP Error: ${context}: ${res.status} ${
          res.statusText.length == 0 ? res.data : res.statusText
        }`,
      );
    }

    notify({
      message: `Posted funding transaction`,
    });

    // refresh
    await getBalance();
  };

  const bundlrUpload = async () => {
    if (hasMaxEditions && isNaN(Number(maxEditions))) {
      throw new Error(`Maximum editions must be specified if limited`);
    }
    const maxSupply = hasMaxEditions ? new BN(Number(maxEditions)) : null;
    if (assetList.length === 0) {
      throw new Error("Must upload at least 1 asset");
    }
    const c = bundlr.utils.currencyConfig;
    const bundlrSigner = await c.getSigner();
    const assetDataItems = await Promise.all(
      assetList.map(async (asset) => {
        return createData(await asset.arrayBuffer(), bundlrSigner, {
          tags: [{ name: "Content-Type", value: asset.type }],
        });
      }),
    );

    for (const dataItem of assetDataItems) {
      await dataItem.sign(bundlrSigner);
      console.log(dataItem.id);
    }

    const manifest = formatManifest(
      assetDataItems.map((a) => `https://arweave.net/${a.id}`),
      Mime.getType(assetList[0].type),
    );

    const manifestDataItem = createData(
      JSON.stringify(manifest),
      bundlrSigner,
      { tags: manifestTags },
    );

    await manifestDataItem.sign(bundlrSigner);
    console.log("metadata", manifestDataItem.id);

    const arweavePathManifest = createArweavePathManifest(
      assetDataItems.map((assetDataItem, idx) => ({
        imageTxId: assetDataItem.id,
        mediaType: `.${Mime.getExtension(assetList[idx].type)}`,
      })),
      manifestDataItem.id,
    );

    const arweavePathManifestDataItem = createData(
      JSON.stringify(arweavePathManifest),
      bundlrSigner,
      { tags: arweavePathManifestTags },
    );

    await arweavePathManifestDataItem.sign(bundlrSigner);
    console.log("manifest", arweavePathManifestDataItem.id);

    const dataItems = [
      ...assetDataItems,
      manifestDataItem,
      arweavePathManifestDataItem,
    ];

    const price: BigNumber = (
      await Promise.all(
        dataItems.map((d) => bundlr.utils.getPrice("solana", d.data.length)),
      )
    ).reduce((c, d) => c.plus(d), new BigNumber(0));
    notify({
      message: `Bundlr Price ${price.div(LAMPORTS_PER_SOL).toString()}`,
    });

    if (balance.lt(price)) {
      const diff = price.minus(balance);
      notify({
        message: `Funding ${diff
          .div(LAMPORTS_PER_SOL)
          .toString()} SOL to the Bundlr`,
      });
      try {
        const amount = new BigNumber(diff);
        await fundBundlr(amount);
      } catch (err) {
        console.log(err);
        notify({
          message: `Failed to fund bundlr wallet`,
          description: err.message,
        });
      }
    }

    const uploaded: Array<UploadMeta | null> = [];
    for (let idx = 0; idx < dataItems.length; ++idx) {
      const dataItem = dataItems[idx];
      let name;
      if (idx < assetList.length) {
        name = assetList[idx].name;
      } else if (idx == assetList.length) {
        name = "metadata.json";
      } else {
        name = "arweave-manifest";
      }
      const arweaveUrl = `https://arweave.net/${dataItem.id}`;
      const viewC = (
        <a
          href={arweaveUrl}
          target="_blank"
          rel="noreferrer"
          style={{
            color: "#7448A3",
          }}
        >
          View on arweave
        </a>
      );
      const existing = await fetch(arweaveUrl, { method: "HEAD" });
      if (existing.ok) {
        notify({
          message: `Already uploaded ${name} to arweave`,
          description: viewC,
        });
        uploaded.push({
          arweave: dataItem.id,
          name: name,
        });
      } else {
        try {
          const res = await bundlr.uploader.dataItemUploader(
            // TODO: fix the dependency mismatch requiring any...
            dataItem as any,
          );
          if (res.status !== 200 && res.status != 201) {
            throw new Error(`Bad status code ${res.status}`);
          }
          if (res.data.id !== dataItem.id) {
            throw new Error(`Uploaded ID does not match expected`);
          }
          notify({
            message: `Uploaded ${name} to arweave`,
            description: viewC,
          });
          uploaded.push({
            arweave: res.data.id,
            name: name,
          });
        } catch (err) {
          console.log(err);
          notify({
            message: `Failed to upload ${name} to bundlr network`,
            description: err.message,
          });
          uploaded.push({
            arweave: null,
            name: name,
          });
        }
      }

      setUploaded(uploaded);
    }

    // refresh
    await getBalance();

    for (const u of uploaded) {
      if (u.arweave === null) throw new Error("Failed to upload some assets");
    }

    const metadataLink = uploaded[assetList.length].arweave;
    const { instructions, mint } = await mintNFTInstructions(
      wallet.publicKey,
      new DataV2({
        collection: undefined,
        uses: undefined,
        name: name,
        symbol: "",
        uri: `https://arweave.net/${metadataLink}`,
        sellerFeeBasisPoints,
        creators: allCreators.map((c) => {
          return new Creator({
            address: c.creator,
            verified: c.creator === wallet.publicKey.toBase58(),
            share: Number(c.share),
          });
        }),
      }),
      maxSupply,
      mintPrice.mint,
      donationAddress(donationConfig),
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
          mint.publicKey.toBase58(),
          connection,
        ),
      });
      await connection.confirmTransaction(result.txid, "finalized");
    }
  };

  const maxWidth = 960;
  const { width } = useWindowDimensions();

  const onConnect = React.useCallback(() => {
    const wrap = async () => {
      setLoading(incLoading);
      try {
        await deriveSigner();
      } catch (err) {
        console.log(err);
      }
      setLoading(decLoading);
    };
    wrap();
  }, [wallet]);

  React.useEffect(() => {
    const adapter = wallet.adapter;
    if (adapter && !signerStr) {
      adapter.on("connect", onConnect);
      return () => {
        adapter.off("connect", onConnect);
      };
    }
  }, [wallet]);

  if (!bundlr || !wallet.connected) {
    return (
      <div className="app stack" style={{ textAlign: "center" }}>
        <div
          style={{
            position: "absolute",
            // ~golden ratio?
            top: "38%",
            left: "50%",
            transform: "translate(-50%, -50%)",
          }}
        >
          {wallet.connected ? (
            <Button className="connector" onClick={onConnect}>
              Just Mint
            </Button>
          ) : (
            <ConnectButton>Just Mint</ConnectButton>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="app stack arweave-upload"
      style={{
        margin: "auto",
        maxWidth: Math.min(width, maxWidth),
      }}
    >
      <Row>
        <Col span={12}>
          <Statistic
            title="Upload Price Est."
            value={
              price ? price.div(LAMPORTS_PER_SOL).toString() : "Connecting..."
            }
            suffix={price ? "SOL" : ""}
          />
        </Col>
        <Col span={12}>
          <Statistic
            title="Total Price Est."
            value={
              price && mintPrice
                ? price
                    .plus(
                      mintPrice.mint + mintPrice.metadata + mintPrice.donation,
                    )
                    .div(LAMPORTS_PER_SOL)
                    .toString()
                : "Connecting..."
            }
            suffix={price ? "SOL" : ""}
          />
        </Col>
      </Row>

      <label className="action-field">
        <span className="field-title">Name</span>
        <Input
          id="name-field"
          value={name}
          onChange={(e) => setName(e.target.value.substr(0, MAX_NAME_LENGTH))}
          placeholder={`Max ${MAX_NAME_LENGTH} characters`}
          autoFocus
        />
      </label>

      <label className="action-field">
        <span className="field-title">Description</span>
        <Input.TextArea
          id="description-field"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          // autoSize
        />
      </label>

      <div>
        <Upload
          beforeUpload={(asset) => {
            setCoverAsset([asset]);
          }}
          onRemove={() => {
            setCoverAsset([]);
          }}
          listType="picture"
          fileList={coverAsset}
          className="select-file-upload"
        >
          <Button>Select Cover Image</Button>
        </Upload>
      </div>
      <div>
        <label className="action-field">
          <span className="field-title">
            <h3>Support Just Mint</h3>
          </span>
          <p>
            This tool costs money to use, the proceeds go to support the
            developers, or to support Charity, your choice
          </p>
        </label>
        <div>
          <span>Support Charity: {DONATION / LAMPORTS_PER_SOL} SOL</span>
          <Switch
            checked={donationConfig.charity}
            onChange={(checked) =>
              setDonationConfig({ charity: checked, creators: !checked })
            }
            checkedChildren="Charity"
            unCheckedChildren="Charity  "
            style={{
              marginLeft: 12,
            }}
          />
        </div>
        <div>
          <span>Support The Creators: {DONATION / LAMPORTS_PER_SOL} SOL</span>
          <Switch
            checked={donationConfig.creators}
            onChange={(checked) =>
              setDonationConfig({ charity: !checked, creators: checked })
            }
            checkedChildren="Creators"
            unCheckedChildren="Creators"
            style={{
              marginLeft: 12,
            }}
          />
        </div>
      </div>

      <CollapsePanel id="upload-funds-bundlr" panelName="Upload Funds">
        <label className="action-field">
          <span className="field-title">
            Bundlr Balance:{" "}
            {balance
              ? balance.div(LAMPORTS_PER_SOL).toString()
              : "Connecting..."}
            <Tooltip
              placement="topLeft"
              title={
                <div>
                  Fund your Bundlr wallet here to pay for arweave uploads!
                </div>
              }
            >
              <Button
                id="fund-bundlr"
                onClick={() => setShowAddFundsModal(true)}
              >
                Manage
              </Button>
            </Tooltip>
          </span>
        </label>
      </CollapsePanel>
      <CollapsePanel id="additional-options" panelName="Additional Options">
        <label className="action-field">
          <span className="field-title">
            External URL {"\u00A0"}
            <Tooltip
              title={
                "URI pointing to an external url defining the asset. example: the game's main site, etc."
              }
            >
              <QuestionCircleOutlined />
            </Tooltip>
          </span>
          <Input
            id="external-url-field"
            value={externalUrl}
            onChange={(e) => setExternalUrl(e.target.value)}
            placeholder={`https://example.com`}
          />
        </label>

        <label className="action-field">
          <span className="field-title">
            Attributes {"\u00A0"}
            <Tooltip
              title={
                "Array of attributes defining the characteristics of the asset"
              }
            >
              <QuestionCircleOutlined />
            </Tooltip>
          </span>
          <EditableTable
            data={attributes}
            setData={setAttributes}
            defaults={{ trait_type: "", value: "" }}
            addTitle={`Add a trait`}
            inputColumns={[
              {
                title: "Trait Type",
                dataIndex: "trait_type",
                width: "30%",
                editable: true,
                placeholder: "position",
              },
              {
                title: "Value",
                dataIndex: "value",
                editable: true,
                placeholder: "bullish",
              },
            ]}
          />
        </label>

        <label className="action-field">
          <span className="field-title">
            Additional Assets {"\u00A0"}
            <Tooltip
              title={
                "Additional images, videos, GLBs, etc., that should be included"
              }
            >
              <QuestionCircleOutlined />
            </Tooltip>
          </span>
          <Upload
            beforeUpload={(asset) => {
              setAdditionalAssets((assetList) => [...assetList, asset]);
            }}
            onRemove={(asset) => {
              setAdditionalAssets((assetList) => {
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
            <Button>Add File</Button>
          </Upload>
        </label>
      </CollapsePanel>

      <CollapsePanel
        id="royalties-creators"
        panelName="Royalties, Prints, and Creators"
      >
        <label className="action-field">
          <span className="field-title">
            Royalties Percentage {"\u00A0"}
            <Tooltip title={"Royalties percentage awarded to creators"}>
              <QuestionCircleOutlined />
            </Tooltip>
          </span>
          <InputNumber
            className="top-level-input"
            min={0}
            max={100}
            defaultValue={5}
            onChange={(value) => setSellerFeeBasisPoints(value * 100)}
            style={{ borderRadius: "8px" }}
          />
        </label>

        <label className="action-field">
          <span className="field-title">
            Maximum Print Editions {"\u00A0"}
            <Tooltip
              title={
                "The number of print editions that can be made. Toggle to remove the cap!"
              }
            >
              <QuestionCircleOutlined />
            </Tooltip>
          </span>
          <div>
            <InputNumber
              className="top-level-input"
              disabled={!hasMaxEditions}
              defaultValue={0}
              onChange={(value) => setMaxEditions(value)}
              style={{ borderRadius: "8px" }}
            />
            <Switch
              checked={hasMaxEditions}
              onChange={(checked) => setHasMaxEditions(checked)}
              checkedChildren="Limited"
              unCheckedChildren="Unlimited"
              style={{
                marginLeft: 12,
              }}
            />
          </div>
        </label>

        <label className="action-field">
          <span className="field-title">
            Creators {"\u00A0"}
            <Tooltip
              title={
                "Creators of this NFT. You (the minter) are always a verified creator!"
              }
            >
              <QuestionCircleOutlined />
            </Tooltip>
          </span>
          <EditableTable
            data={allCreators}
            setData={(cs: any[]) => {
              const fixed = cs.find(isRequiredCreator);
              const nonfixed = cs.filter((r) => !isRequiredCreator(r));
              if (fixed.share !== requiredCreatorShare) {
                setRequiredCreatorShare(fixed.share);
              }
              setCreators(nonfixed);
            }}
            defaults={{ creator: "", share: "", key: 0 }}
            addTitle={`Add a creator`}
            inputColumns={[
              {
                title: "Creator",
                dataIndex: "creator",
                editable: true,
                editingCheck: (record: any) => {
                  if (!wallet.publicKey) return true;
                  return record.creator !== wallet.publicKey.toBase58();
                },
                placeholder: TOKEN_PROGRAM_ID.toBase58(),
                rules: [
                  {
                    validator: (_: any, value: string) => {
                      try {
                        new PublicKey(value);
                        return Promise.resolve();
                      } catch (err) {
                        return Promise.reject(
                          new Error(`Invalid creator pubkey ${value}`),
                        );
                      }
                    },
                  },
                ],
              },
              {
                title: "Share",
                dataIndex: "share",
                width: "30%",
                editable: true,
                placeholder: "0",
                rules: [
                  {
                    validator: (_: any, value: string) => {
                      const share = Number(value);
                      if (isNaN(share))
                        return Promise.reject(
                          new Error(`Non-numeric share: ${value}`),
                        );
                      if (Math.floor(share) !== share)
                        return Promise.reject(
                          new Error(`Share contains decimals: ${value}`),
                        );
                      if (share < 0 || share > 100)
                        return Promise.reject(
                          new Error(`Shared must be in range [0, 100]`),
                        );
                      return Promise.resolve();
                    },
                  },
                ],
              },
            ]}
          />
        </label>
      </CollapsePanel>

      <div>
        <Button
          icon={<UploadOutlined />}
          onClick={() => {
            const wrap = async () => {
              setLoading(incLoading);
              try {
                await checkCreators();
                await bundlrUpload();
              } catch (err) {
                console.log(err);
                notify({
                  message: `Bundlr upload failed`,
                  description: err.message,
                });
              }
              setLoading(decLoading);
            };
            wrap();
          }}
          disabled={assetList.length === 0 || !bundlr}
        >
          MINT
        </Button>
      </div>

      {uploaded.length !== 0 && (
        <List
          itemLayout="horizontal"
          dataSource={uploaded}
          renderItem={(key: UploadMeta | null) => (
            <List.Item>
              <List.Item.Meta
                title={<div>{key.name}</div>}
                description={
                  key.arweave && (
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
                  )
                }
              />
            </List.Item>
          )}
        />
      )}

      <MetaplexModal
        visible={showAddFundsModal}
        onCancel={() => setShowAddFundsModal(false)}
        title="Manage Bundlr Wallet"
        bodyStyle={{
          alignItems: "start",
          padding: "24px 48px 48px 48px",
        }}
      >
        <Tabs defaultActiveKey="1" style={{ width: "100%" }}>
          <Tabs.TabPane tab="Fund" key="1">
            <label
              className="action-field"
              style={{
                width: "100%",
                marginBottom: 0,
              }}
            >
              <span className="field-title">Add SOL {"\u00A0"}</span>
              <InputNumber
                className="modal-input-field"
                value={fundBundlrAmount}
                onChange={(value) => setFundBundlrAmount(value)}
              />
            </label>
            <p style={{ color: "white", marginBottom: "10px" }}>
              We integrate with the Bundlr Network to make it simple to mint
              NFTs. Bundlr needs to be funded with SOL for arweave uploads.
            </p>
            <Button
              className="fund-modal-btn"
              onClick={() => {
                const wrap = async () => {
                  setLoading(incLoading);
                  try {
                    const amount = new BigNumber(fundBundlrAmount).times(
                      new BigNumber(LAMPORTS_PER_SOL),
                    );

                    await fundBundlr(amount);
                  } catch (err) {
                    console.log(err);
                    notify({
                      message: `Failed to fund bundlr wallet`,
                      description: err.message,
                    });
                  }
                  setLoading(decLoading);
                };
                wrap();
                setShowAddFundsModal(false);
              }}
              style={{
                width: "100%",
              }}
            >
              Fund
            </Button>
          </Tabs.TabPane>

          <Tabs.TabPane tab="Recover" key="2">
            <label
              className="action-field"
              style={{
                width: "100%",
                marginBottom: 0,
              }}
            >
              <span className="field-title">
                Recover Transaction {"\u00A0"}
              </span>
              <Input
                className="modal-input-field"
                value={recoverBundlrTxId}
                onChange={(e) => setRecoverBundlrTxId(e.target.value)}
                placeholder={"Transaction signature"}
              />
            </label>
            <p style={{ color: "white", marginBottom: "10px" }}>
              Recover a funding payment that failed due to network issues.
            </p>
            <Button
              className="fund-modal-btn"
              onClick={() => {
                const wrap = async () => {
                  setLoading(incLoading);
                  try {
                    await postFunding(recoverBundlrTxId);
                  } catch (err) {
                    console.log(err);
                    notify({
                      message: `Failed to recover bundlr transaction`,
                      description: err.message,
                    });
                  }
                  setLoading(decLoading);
                };
                wrap();
                setShowAddFundsModal(false);
              }}
              style={{
                width: "100%",
              }}
            >
              Recover
            </Button>
          </Tabs.TabPane>
        </Tabs>
      </MetaplexModal>
    </div>
  );
};
