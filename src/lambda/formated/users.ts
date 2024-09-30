export function curatingData(fileContent: string): string {
    const rows = fileContent.split('\n');
    const headers = rows[0].split('\t');

    const columnIndexes = {
        user_id: headers.indexOf('user_id'),
        vegetable_side_dish: headers.indexOf('vegetable_side_dish'),
        grandpa: headers.indexOf('grandpa'),
        subscribed: headers.indexOf('subscribed'),
        show_meats: headers.indexOf('show_meats')
    };

    const curatedRows = rows.slice(1).map(row => {
        const columns = row.split('\t');
        const userId = columns[columnIndexes.user_id];
        const interests = [];

        if (columns[columnIndexes.vegetable_side_dish] === '1') interests.push('vegetable');
        if (columns[columnIndexes.grandpa] === '1') interests.push('grandpa');
        if (columns[columnIndexes.subscribed] === '1') interests.push('subscribed');
        if (columns[columnIndexes.show_meats] === '1') interests.push('show_meats');

        const interestsString = interests.join('|');

        return `${userId},${interestsString}`;
    });

    const curatedCsv = ['USER_ID,INTEREST', ...curatedRows].join('\n');

    return curatedCsv;
}