import * as React from "react";
import { RouteComponentProps } from "react-router-dom";
import queryString from 'query-string';
import {
  Button,
} from 'antd';

import {
  PublicKey,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  Metadata,
  SignMetadata,
} from '@metaplex-foundation/mpl-token-metadata';

import { useWindowDimensions } from '../components/AppBar';
import { EditableTable } from '../components/EditableTable';
import {
  decLoading,
  incLoading,
  useLoading,
} from '../components/Loader';
import {
  sendTransactionWithRetry,
  useConnection,
} from '../contexts/ConnectionContext';
import {
  notify,
} from '../utils/common';
import {
  explorerLinkFor,
} from '../utils/transactions';

export type SignProps = {};

export const SignView = (
  props : RouteComponentProps<SignProps>,
) => {
  // contexts
  const connection = useConnection();
  const wallet = useWallet();

  // params + user inputs
  const query = props.location.search;
  const params = queryString.parse(query, {arrayFormat: 'comma'});

  const initialMints = [];
  if (!params.mints) {
    // skip
  } else if (typeof params.mints === "string") {
    try {
      initialMints.push(new PublicKey(params.mints).toBase58());
    } catch (err) {
      console.warn(`string param parse error ${params.mints}`, err.message);
    }
  } else {
    // array?
    for (const m of [...new Set(params.mints)]) {
      try {
        initialMints.push(new PublicKey(m).toBase58());
      } catch (err) {
        console.warn(`array param parse error ${m}`, err.message);
      }
    }
  }

  const [mintsToSign, setMintsToSign] = React.useState<Array<any>>(
    initialMints.map(m => ({ mint: m, key: m })));
  const { setLoading } = useLoading();

  // derived + async useEffect
  const maxWidth = 960;
  const { width } = useWindowDimensions();

  const signAll = async () => {
    const batchSize = 10;
    for (let idx = 0; idx < mintsToSign.length; idx += batchSize) {
      const instructions : Array<TransactionInstruction> = [];
      const batchStart = idx;
      const batchEnd = Math.min(idx + batchSize, mintsToSign.length);
      for (let jdx = batchStart; jdx < batchEnd; ++jdx) {
        const { mint } = mintsToSign[jdx];
        const metadataAccount = await Metadata.getPDA(new PublicKey(mint));
        instructions.push(
          ...new SignMetadata(
            {
              feePayer: wallet.publicKey,
            },
            {
              metadata: metadataAccount,
              creator: wallet.publicKey,
            }
          ).instructions,
        );
      }

      const result = await sendTransactionWithRetry(
        connection,
        wallet,
        instructions,
        []
      );

      console.log(result);
      if (typeof result === "string") {
        throw new Error(result);
      } else {
        notify({
          message: `Signed mints [${batchStart}, ${batchEnd}). Waiting confirmation`,
          description: (
            <a
              href={explorerLinkFor(result.txid, connection)}
              target="_blank"
              rel="noreferrer"
              style={{
                color: '#7448A3',
              }}
            >
              View on explorer
            </a>
          ),
        })

        await connection.confirmTransaction(result.txid, 'confirmed');
      }
    }
  };

  return (
    <div
      className="app stack arweave-upload"
      style={{
        margin: 'auto',
        maxWidth: Math.min(width, maxWidth),
      }}
    >
      <EditableTable
        data={mintsToSign}
        setData={setMintsToSign}
        defaults={{ mint: '', key: 0 }}
        addTitle={`Add a mint`}
        inputColumns={[
          {
            title: 'Mint',
            dataIndex: 'mint',
            editable: true,
            placeholder: TOKEN_PROGRAM_ID.toBase58(),
            rules: [
              {
                validator: (_: any, value: string) => {
                  try {
                    new PublicKey(value);
                    return Promise.resolve();
                  } catch (err) {
                    return Promise.reject(new Error(`Invalid mint pubkey ${value}`));
                  }
                },
              }
            ]
          },
        ]}
      />
      <Button
        onClick={() => {
          const wrap = async () => {
            setLoading(incLoading);
            try {
              await signAll();
            } catch (err) {
              console.log(err);
              notify({
                message: `Sign all failed`,
                description: err.message,
              })
            }
            setLoading(decLoading);
          };
          wrap();
        }}
        disabled={mintsToSign.length === 0 || !wallet.connected}
      >
        Sign All
      </Button>
    </div>
  );
}
