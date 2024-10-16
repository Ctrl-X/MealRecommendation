import React, {useState, useCallback} from 'react';
import {Button, Modal, Statistic} from 'antd';
import UserList from '../components/UserList';
import TopPicks from '../components/TopPicks';
import UserInteractions from '../components/UserInteractions';
import MostPopular from '../components/MostPopular';
import MenuComparator from '../components/MenuComparator'; // You'll need to create this component

const UsersPage = ({apiRootUrl, totalUsers, allMenus}) => {
    const [selectedUserId, setSelectedUserId] = useState(null);
    const [checkedItemIds, setCheckedItemIds] = useState([]);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [selectedMenu, setSelectedMenu] = useState(null);


    const handleUserSelect = useCallback((userId) => {
        setSelectedUserId(userId);
        setCheckedItemIds([]); // Clear the checkedItemIds when a new user is selected
    }, []);

    const handleCheckMenu = useCallback((itemId, isChecked) => {
        setCheckedItemIds(prevIds => {
            if (isChecked) {
                return [...prevIds, itemId];
            } else {
                return prevIds.filter(id => id !== itemId);
            }
        });
    }, []);

    const handleCheckSelectedMenu = useCallback((itemId, isChecked, item) => {
        if (item) {
            if (isChecked) {
                setSelectedMenu(item)
            } else {
                setSelectedMenu(null)
            }
        }
    }, []);

    const showModal = () => {
        setIsModalVisible(true);
    };

    const handleModalCancel = () => {
        setIsModalVisible(false);
    };

    return (
        <div>
            <div style={{display: 'flex', justifyContent: 'space-between', marginLeft: 10, marginRight: 10}}>
                <Statistic title="Global Users" value={totalUsers}/>
                <Statistic title="Global Menus" value={allMenus.length}/>
                <Button
                    type="primary"
                    onClick={showModal}
                    disabled={checkedItemIds.length === 0}
                >
                    Compare
                </Button>
            </div>
            <div style={{display: 'flex'}}>
                <div style={{flex: 1}}>
                    <UserList apiRootUrl={apiRootUrl} onUserSelect={handleUserSelect}/>
                </div>
                <div style={{flex: 2}}>
                    <UserInteractions
                        apiRootUrl={apiRootUrl}
                        userId={selectedUserId}
                        onCheckMenu={handleCheckSelectedMenu}
                        checkedItemIds={checkedItemIds}
                        selectedMenu={selectedMenu}
                    />

                    <TopPicks
                        apiRootUrl={apiRootUrl}
                        userId={selectedUserId}
                        onCheckMenu={handleCheckMenu}
                        checkedItemIds={checkedItemIds}
                    />
                    <MostPopular apiRootUrl={apiRootUrl}
                                 userId={selectedUserId}
                                 onCheckMenu={handleCheckMenu}
                                 checkedItemIds={checkedItemIds}
                    />

                </div>
            </div>
            <Modal
                title="Menu Comparison"
                visible={isModalVisible}
                onCancel={handleModalCancel}
                footer={null}
                width={1000}
            >
                <MenuComparator apiRootUrl={apiRootUrl} itemIds={checkedItemIds} searchQuery={selectedMenu ? selectedMenu.menuName : ""}/>
            </Modal>
        </div>
    );
};

export default UsersPage;