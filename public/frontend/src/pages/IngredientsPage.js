import React, { useState, useEffect } from 'react';
import {Row, Col, message, Statistic, Progress, Button, Modal, Divider} from 'antd';
import axios from 'axios';
import IngredientList from '../components/IngredientList';
import MenuCreator from '../components/MenuCreator';
import MenuList from '../components/MenuList';
import MenuComparator from "../components/MenuComparator";

const IngredientsPage = ({ apiRootUrl,totalUsers, allMenus }) => {
    const [ingredients, setIngredients] = useState([]);
    const [selectedIngredients, setSelectedIngredients] = useState([]);
    const [selectedMenu, setSelectedMenu] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [similarLoading, setSimilarLoading] = useState(false);
    const [primaryIngredients, setPrimaryIngredients] = useState([]);
    const [secondaryIngredients, setSecondaryIngredients] = useState([]);
    const [tertiaryIngredients, setTertiaryIngredients] = useState([]);
    const [searchResults, setSearchResults] = useState([]);
    const [checkedItemIds, setCheckedItemIds] = useState([]);
    const [totalInterested, setTotalInterested] = useState(0);
    const [isModalVisible, setIsModalVisible] = useState(false);


    useEffect(() => {
        fetchIngredients();
    }, []);
    useEffect(() => {
        if (ingredients.length > 0 && allMenus.length > 0) {
            extractIngredientSets();
        }
    }, [ingredients, allMenus]);

    const countSorting = (a, b) => (b.count || 0) - (a.count || 0)

    const extractIngredientSets = () => {
        const primary = new Set();
        const secondary = new Set();
        const tertiary = new Set();

        allMenus.forEach(menu => {
            if (menu.genres && menu.genres !== "none") primary.add(menu.genres);
            if (menu.genre_l2 && menu.genre_l2 !== "none") secondary.add(menu.genre_l2);
            if (menu.genre_l3 && menu.genre_l3 !== "none") tertiary.add(menu.genre_l3);
        });

        const getIngredientWithCount = (name) => {
            const ingredient = ingredients.find(ing => ing.name === name);
            return { name, count: ingredient ? ingredient.count : 0 };
        };

        setPrimaryIngredients(Array.from(primary).map(getIngredientWithCount).sort(countSorting));
        setSecondaryIngredients(Array.from(secondary).map(getIngredientWithCount).sort(countSorting));
        setTertiaryIngredients(Array.from(tertiary).map(getIngredientWithCount).sort(countSorting));
    };

    const fetchIngredients = async () => {
        try {
            const response = await axios.get(`${apiRootUrl}/menus`, {
                params: { type: 'ingredients' }
            });
            const sortedIngredients = response.data.sort(countSorting);
            setIngredients(sortedIngredients);
            const initialSelected = sortedIngredients.map(ingredient => ingredient.name);
            setSelectedIngredients(initialSelected);
            setLoading(false);
        } catch (error) {
            console.error('Error fetching ingredients:', error);
            message.error('Failed to load ingredients');
            setLoading(false);
        }
    };

    const handleSelectIngredient = (id, isSelected) => {
        setSelectedIngredients(prevSelected =>
            isSelected
                ? [...prevSelected, id]
                : prevSelected.filter(ingredientId => ingredientId !== id)
        );
    };


    const getRemainingIngredients = () => {
        const specialIngredients = new Set([
            ...primaryIngredients.map(i => i.name),
            ...secondaryIngredients.map(i => i.name),
            ...tertiaryIngredients.map(i => i.name)
        ]);
        return ingredients.filter(ingredient => !specialIngredients.has(ingredient.name));
    };


    const handleSelectMenu = async (selectedMenu) => {
        setSelectedMenu(selectedMenu)
        setSimilarLoading(true)
        const searchQuery = `${selectedMenu.name},${selectedMenu.ingredients.join(',')}`;
        setSearchQuery(searchQuery)
        setCheckedItemIds([])
        try {
            const searchResponse = await axios.get(`${apiRootUrl}/search`, {
                params: { search: searchQuery }
            });

            const menus = searchResponse.data.map(item => ({
                item_id: item.id,
                name: item.metadata.name,
                score: item.score,
                userCount: 0
            }));

            const updatedMenus = await Promise.all(menus.map(async (menu) => {
                try {
                    const userCountResponse = await axios.get(`${apiRootUrl}/users`, {
                        params: { isCounting: '1', itemIds: menu.item_id }
                    });
                    return { ...menu, userCount: userCountResponse.data.count };
                } catch (error) {
                    console.error(`Error fetching user count for menu ${menu.item_id}:`, error);
                    return menu;
                }
            }));

            setSearchResults(updatedMenus);
            setSimilarLoading(false)
            const interestedResponse = await axios.get(`${apiRootUrl}/users`, {
                params: {
                    isCounting: '1',
                    itemIds: menus.map(menu => menu.item_id).join(",")
                }
            });

            const totalInterested = interestedResponse.data.count
            setTotalInterested(totalInterested)
        } catch (error) {
            setSimilarLoading(false)
            console.error('Error searching menus:', error);
            message.error('Failed to search menus');
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
        <div style={{margin:10}}>
            <Row gutter={[16, 16]}>
                <Col span={6}>

                    <IngredientList
                        loading={loading}
                        title="Primary Ingredients"
                        ingredients={primaryIngredients}
                        selectedIngredients={selectedIngredients}
                        onSelectIngredient={handleSelectIngredient}
                    />
                </Col>
                <Col span={6}>
                    <IngredientList
                        loading={loading}
                        title="Secondary Ingredients"
                        ingredients={secondaryIngredients}
                        selectedIngredients={selectedIngredients}
                        onSelectIngredient={handleSelectIngredient}
                    />
                </Col>
                <Col span={6}>

                    <IngredientList
                        loading={loading}
                        title="Tertiary Ingredients"
                        ingredients={tertiaryIngredients}
                        selectedIngredients={selectedIngredients}
                        onSelectIngredient={handleSelectIngredient}
                    />
                </Col>
                <Col span={6}>

                    <IngredientList
                        loading={loading}
                        title="Other Ingredients"
                        ingredients={getRemainingIngredients()}
                        selectedIngredients={selectedIngredients}
                        onSelectIngredient={handleSelectIngredient}
                    />
                </Col>
            </Row>
            <Divider/>
            <Row gutter={[10, 10]}>
                <Col span={12}>
                    <MenuCreator
                        apiRootUrl={apiRootUrl}
                        selectedIngredients={selectedIngredients}
                        selectedMenu={selectedMenu}
                        onSelectMenu={handleSelectMenu}
                    />
                </Col>
                <Col span={12}>
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'right',
                        marginLeft: '10px',
                        marginRight: '10px'
                    }}>

                        <Statistic title="Global Users" value={totalUsers}/>
                        <Statistic title="Global Menus" value={allMenus.length}/>
                        {!!totalInterested &&
                            <>
                                <Statistic title="Potential Users " value={totalInterested}/>
                                <Progress type="circle" percent={100 * totalInterested / totalUsers}
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
                    {selectedMenu &&
                    <MenuList
                        menus={searchResults}
                        loading={similarLoading}
                        selectedMenu={selectedMenu}
                        totalUsers={totalUsers}
                        apiRootUrl={apiRootUrl}
                        onCheckMenu={handleCheckMenu}
                        checkedItemIds={checkedItemIds}
                    />
                    }
                </Col>
            </Row>
            <Modal
                title="Menu Comparison"
                visible={isModalVisible}
                onCancel={handleModalCancel}
                footer={null}
                width={1000}
            >
                <MenuComparator apiRootUrl={apiRootUrl} itemIds={checkedItemIds}  searchQuery={searchQuery}/>
            </Modal>
        </div>
    );
};

export default IngredientsPage;