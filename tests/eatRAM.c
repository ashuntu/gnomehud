#include <stdlib.h>

int main()
{
    while (1)
    {
        void *m = malloc(1024 * 1024);
        memset(m, 0, 1024 * 1024);
    }

    return 0;
}