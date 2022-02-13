import React from "react";
import { Link, useLocation } from 'react-router-dom';

import { Button, Modal } from 'antd';
import { MenuOutlined } from '@ant-design/icons';
import { useWallet } from '@solana/wallet-adapter-react';

import closeSvg from './close.svg';
import {
  Cog,
  CurrentUserBadge,
  CurrentUserBadgeMobile,
} from '../CurrentUserBadge';
import { ConnectButton } from '../ConnectButton';

function getWindowDimensions() {
  const { innerWidth: width, innerHeight: height } = window;
  return {
    width,
    height,
  };
}

export function useWindowDimensions() {
  const [windowDimensions, setWindowDimensions] = React.useState(
    getWindowDimensions(),
  );

  React.useEffect(() => {
    function handleResize() {
      setWindowDimensions(getWindowDimensions());
    }

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return windowDimensions;
}

export const LogoLink = () => {
  return (
    <Link to={`/`}>
      <p className={"app-logo"}>MINT</p>
    </Link>
  );
};

export const MetaplexMenu = () => {
  const { width } = useWindowDimensions();
  const [isModalVisible, setIsModalVisible] = React.useState<boolean>(false);
  const { connected } = useWallet();

  if (width < 768)
    return (
      <>
        <Modal
          title={<LogoLink />}
          visible={isModalVisible}
          footer={null}
          className={'modal-box'}
          closeIcon={
            <img
              onClick={() => setIsModalVisible(false)}
              src={closeSvg}
            />
          }
        >
          <div className="site-card-wrapper mobile-menu-modal">
            <div className="actions">
              {!connected ? (
                <div className="actions-buttons">
                  <ConnectButton
                    onClick={() => setIsModalVisible(false)}
                    className="secondary-btn"
                  />
                  {/*<HowToBuyModal
                    onClick={() => setIsModalVisible(false)}
                    buttonClassName="black-btn"
                  />*/}
                </div>
              ) : (
                <>
                  <CurrentUserBadgeMobile
                    showBalance={false}
                    showAddress={true}
                    iconSize={24}
                    closeModal={() => {
                      setIsModalVisible(false);
                    }}
                  />
                  <Cog />
                </>
              )}
            </div>
          </div>
        </Modal>
        <MenuOutlined
          onClick={() => setIsModalVisible(true)}
          style={{ fontSize: '1.4rem' }}
        />
      </>
    );

  return null;
};
export const MobileNavbar = () => {
  return (
    <div id="mobile-navbar">
      <LogoLink />
      <div className="mobile-menu">
        <MetaplexMenu />
      </div>
    </div>
  )
}

const penSvg = (filled: boolean) => {
  const props = filled
    ? { fill: 'white' }
    : {
      fill: 'none',
      stroke: 'white',
      strokeWidth: '20px',
    };
  return (
    <svg width="20" height="20" viewBox="0 0 512 512" {...props} >
      <rect x="129.177" y="254.498" transform="matrix(0.7071 -0.7071 0.7071 0.7071 -161.9856 228.3968)" width="131.06" height="110.469"/>
      <path d="M92.531,347.45l-71.281,42.037L0,504.437l114.951-21.249l42.037-71.282L92.531,347.45z M80.187,447.865
        c-6.519,6.52-17.091,6.52-23.611,0s-6.52-17.091,0-23.611c6.52-6.52,17.091-6.52,23.611,0
        C86.707,430.774,86.707,441.345,80.187,447.865z"/>
      <path d="M468.181,128.393l9.648-9.648c25.401-25.401,25.401-66.73,0-92.131c-25.401-25.401-66.73-25.401-92.131,0L218.591,193.718
        l92.132,92.132l133.389-133.389l19.751,19.751L300.806,335.269l24.068,24.068L512,172.212L468.181,128.393z"/>
    </svg>
  )
}

export const AppBar = () => {
  const { connected } = useWallet();
  const location = useLocation();
  return (
    <>
      <MobileNavbar />
      <div id="desktop-navbar">
        <div className="app-left">
          <LogoLink />
        </div>
        <div className="app-right">
          {/*!connected && (
            <HowToBuyModal buttonClassName="modal-button-default" />
          )*/}
          {connected && (
            <>
              <CurrentUserBadge
                showBalance={false}
                showAddress={true}
                iconSize={24}
              />
                <Button className="wallet-key">
                  <Link to="/sign">
                    {penSvg(location.pathname === "/sign")}
                  </Link>
                </Button>
              <Cog />
            </>
          )}
        </div>
      </div>
    </>
  );
};

