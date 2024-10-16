import React, {useState} from 'react';
import {Button, Card, message, Avatar, Modal, Spin} from 'antd';
import axios from 'axios';

const MenuCreator = ({apiRootUrl, selectedIngredients, selectedMenu, onSelectMenu}) => {
    const [loading, setLoading] = useState(false);
    const [createdMenus, setCreatedMenus] = useState([]);
    const [modalVisible, setModalVisible] = useState(false);
    const [modalMenu, setModalMenu] = useState('');

    const createMenus = async () => {
        if (selectedIngredients.length === 0) {
            message.warning('Please select at least one ingredient');
            return;
        }

        setLoading(true);
        try {
            const response = await axios.get(`${apiRootUrl}/menus`, {
                params: {
                    type: 'creator',
                    ingredients: selectedIngredients.join(',')
                }
            });

            setCreatedMenus(response.data);

            // Generate images for each menu
            Promise.all(response.data.map(async (menu) => {
                const imageDescription = `${menu.name}: ${menu.description}. Ingredients: ${menu.ingredients.join(', ')}`;
                const imageResponse = await axios.get(`${apiRootUrl}/menus`, {
                    params: {
                        type: 'image',
                        description: imageDescription
                    }
                });
                return {...menu, image: imageResponse.data.image};
            })).then(menusWithImages => {
                console.log("menusWithImages", menusWithImages)
                setCreatedMenus(menusWithImages);
            });


            message.success('Menus created successfully!');
        } catch (error) {
            console.error('Error creating menus:', error);
            message.error('Failed to create menus. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleImageClick = (menu) => {
        setModalMenu(menu);
        setModalVisible(true);
    };


    return (
        <div>
            <h2>Create Menus</h2>
            <Button type="primary" onClick={createMenus} loading={loading}>
                Create Menus with Selected Ingredients
            </Button>

            {createdMenus.map((menu, index) => (
                <Card key={index} title={menu.name}
                      hoverable
                      onClick={() => onSelectMenu(menu)}
                      style={{marginTop: 16}}>
                    <div style={{display: "flex", flexDirection: "row", justifyContent: "flex-start"}}>
                        <div>
                            <Avatar
                                icon={<Spin/>}
                                src={`data:image/png;base64,${menu.image}`}
                                size={150}
                                shape="square"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleImageClick(menu);
                                }}
                                style={{cursor: 'pointer', marginRight: 20}}
                            />
                        </div>
                        <div>
                            <p><strong>Description:</strong> {menu.description}</p>
                            <p><strong>Ingredients: </strong>
                                {menu.ingredients.join(", ")}
                            </p>
                        </div>
                    </div>
                </Card>
            ))}

            <Modal
                visible={modalVisible}
                onCancel={() => setModalVisible(false)}
                footer={null}
                width="80%"
            >
                {modalMenu &&
                    <div style={{display: "flex", flexDirection: "row", justifyContent: "flex-start"}}>

                        <img src={`data:image/png;base64,${modalMenu.image}`} alt={modalMenu.name}
                             style={{width: '50%', marginRight: 20}}/>
                        <div>
                            <p><strong>Name:</strong> {modalMenu.name}</p>
                            <p><strong>Description:</strong> {modalMenu.description}</p>
                            <p><strong>Ingredients: </strong>
                                {modalMenu.ingredients.join(", ")}
                            </p>
                        </div>
                    </div>
                }
            </Modal>
        </div>
    );
};

export default MenuCreator;