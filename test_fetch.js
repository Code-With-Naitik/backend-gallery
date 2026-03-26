const testFetch = async () => {
    try {
        const response = await fetch('http://localhost:8080/category');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        console.log('Categories from Backend:', JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('Error fetching categories:', err.message);
    }
};

testFetch();
