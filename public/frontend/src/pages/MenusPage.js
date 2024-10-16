import React, {useState, useEffect} from 'react';
import {Row, Col, Button, Modal, Statistic, Progress} from 'antd';
import axios from 'axios';
import SearchBar from '../components/SearchBar';
import MenuList from '../components/MenuList';
import MenuComparator from '../components/MenuComparator';
import UserList from "../components/UserList";

const MenusPage = ({apiRootUrl, totalUsers, allMenus}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [menus, setMenus] = useState([]);
    const [checkedItemIds, setCheckedItemIds] = useState([]);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [totalInterested, setTotalInterested] = useState(0);

    const handleSearch = async (query) => {
        setSearchQuery(query);
        try {
            const searchResponse = await axios.get(`${apiRootUrl}/search`, {
                params: {search: query}
            });
            // Extract item IDs from search results
            const menus = searchResponse.data.map(item => {
                return {
                    item_id: item.id,
                    name: item.metadata.name,
                    score: item.score,
                    userCount: 0
                }
            });
            setCheckedItemIds([])
            setMenus(menus);

            // Fetch user count for each menu
            const updatedMenus = await Promise.all(menus.map(async (menu) => {
                try {
                    const userCountResponse = await axios.get(`${apiRootUrl}/users`, {
                        params: {
                            isCounting: '1',
                            itemIds: menu.item_id
                        }
                    });
                    return { ...menu, userCount: userCountResponse.data.count };
                } catch (error) {
                    console.error(`Error fetching user count for menu ${menu.item_id}:`, error);
                    return menu;
                }
            }));


            setMenus(updatedMenus);

            const interestedResponse = await axios.get(`${apiRootUrl}/users`, {
                params: {
                    isCounting: '1',
                    itemIds: menus.map(menu => menu.item_id).join(",")
                }
            });

            const totalInterested = interestedResponse.data.count
            setTotalInterested(totalInterested)

        } catch (error) {
            console.error('Error searching menus:', error);
        }
    };

    const handleCheckMenu = (itemId, isChecked) => {
        setCheckedItemIds(prevIds => {
            if (isChecked) {
                return [...prevIds, itemId];
            } else {
                return prevIds.filter(id => id !== itemId);
            }
        });
    };

    const showModal = () => {
        setIsModalVisible(true);
    };

    const handleModalCancel = () => {
        setIsModalVisible(false);
    };

    return (
        <div>
            <h1>Check if a menu will be liked</h1>
            <SearchBar onSearch={handleSearch}/>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'right', marginLeft: '10px', marginRight: '10px'}}>

                <Statistic title="Global Users" value={totalUsers}/>
                <Statistic title="Global Menus" value={allMenus.length}/>
                {!!totalInterested &&
                    <>
                        <Statistic title="Potential Users" value={totalInterested}/>
                        <Progress type="circle" percent={100* totalInterested / totalUsers}
                                  format={(percent) => `${totalInterested} Users`}/>
                    </>
                }

                <Button
                    type="primary"
                    onClick={showModal}
                    disabled={checkedItemIds.length === 0}
                >
                    Compare
                </Button>
            </div>
            <Row gutter={16}>
                <Col span={12}>
                    <MenuList
                        menus={menus}
                        totalUsers={totalUsers}
                        apiRootUrl={apiRootUrl}
                        onCheckMenu={handleCheckMenu}
                        checkedItemIds={checkedItemIds}
                    />
                </Col>
                <Col span={12}>
                    <UserList menus={menus}
                              apiRootUrl={apiRootUrl}
                    onUserSelect={ () => {}}/>
                </Col>
            </Row>
            <Modal
                title="Menu Comparison"
                visible={isModalVisible}
                onCancel={handleModalCancel}
                footer={null}
                width={1000}
            >
                <MenuComparator apiRootUrl={apiRootUrl} itemIds={checkedItemIds} searchQuery={searchQuery}/>
            </Modal>
        </div>
    )
        ;
};

export default MenusPage;