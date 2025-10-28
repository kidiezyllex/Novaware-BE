export const handleError = (res, error) => {
    console.error('Detailed error:', error); 
    res.status(500).json({
      message: 'Internal Server Error',
      error: error.message || 'Unknown error',
    });
  };
  