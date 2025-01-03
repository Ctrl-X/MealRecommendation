import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {BrowserRouter as Router, Route, Routes, Link} from 'react-router-dom';
import {Alert, Breadcrumb, Layout, Menu, theme} from 'antd';
import './App.css';
import logo from './aws_logo.png';


import UsersPage from './pages/UsersPage';
import MenusPage from './pages/MenusPage';
import IngredientsPage from './pages/IngredientsPage';

const {Header, Content, Footer} = Layout;

const App = () => {
    const [totalUsers, setTotalUsers] = useState(0);
    const [allMenus, setAllMenus] = useState([]);
    const apiRootUrl = "https://nqq0br7hvh.execute-api.us-east-1.amazonaws.com/beta";
    const {
        token: {colorBgContainer, borderRadiusLG},
    } = theme.useToken();


    const fetchTotalUsers = async () => {
        try {
            const response = await axios.get(`${apiRootUrl}/users`, {
                params: { isCounting: '1' }
            });
            setTotalUsers(response.data.count);
        } catch (error) {
            console.error('Error fetching total users:', error);
        }
    };

    const fetchAllMenus = async () => {
        try {
            const response = await axios.get(`${apiRootUrl}/menus`);
            setAllMenus(response.data);
        } catch (error) {
            console.error('Error fetching all menus:', error);
        }
    };

    useEffect(() => {
        fetchTotalUsers();
        fetchAllMenus();
    }, []);


    return (
        <Router>
            <Layout>
                <Header style={{display: 'flex', alignItems: 'center'}}>
                    <Menu
                        theme="dark"
                        mode="horizontal"
                        defaultSelectedKeys={['1']}
                        style={{flex: 1, minWidth: 0}}
                    >
                        <Menu.Item key="1"><Link to="/">Menu Recommendation</Link></Menu.Item>
                        <Menu.Item key="2"><Link to="/menus">Menu Prediction</Link></Menu.Item>
                        <!-- <Menu.Item key="3"><Link to="/ingredients">By Ingredients</Link></Menu.Item> -->
                    </Menu>
                </Header>
                <Content style={{padding: '0 48px'}}>
                    <Breadcrumb
                        style={{
                            margin: '16px 0',
                        }}
                    >
                        <Breadcrumb.Item>AI-Powered Personalized Menu Recommendations</Breadcrumb.Item>
                    </Breadcrumb>
                    <Layout
                        style={{
                            padding: '24px 0',
                            background: colorBgContainer,
                            borderRadius: borderRadiusLG,
                        }}
                    >
                        <div style={{
                            background: colorBgContainer,
                            minHeight: 280,
                            paddingHorizontal: 24,
                            borderRadius: borderRadiusLG
                        }}>
                            <Routes>
                                <Route path="/" element={<UsersPage apiRootUrl={apiRootUrl} totalUsers={totalUsers} allMenus={allMenus}/>}/>
                                <Route path="/menus" element={<MenusPage apiRootUrl={apiRootUrl}  totalUsers={totalUsers} allMenus={allMenus} />}/>
                                <Route path="/ingredients" element={<IngredientsPage apiRootUrl={apiRootUrl}  totalUsers={totalUsers} allMenus={allMenus}/>}/>
                            </Routes>
                        </div>
                    </Layout>


                </Content>
                <Footer style={{textAlign: 'center'}}>
                    AI-Powered Personalized Menu Recommendations
                </Footer>
            </Layout>
        </Router>
    );
};


export default App;
